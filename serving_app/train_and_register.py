"""판매량 20일 x 11피처 학습 및 warm start 연결.

baseline의 sales_scaler.pkl을 고정 재사용하고 날짜 기준으로 학습과 검증을 나눈다.
운영 LSTM, MSE와 기존 학습 설정은 유지한다. RMSE는 판매 수량의 진단 지표다.
기존 RMSE 게이트는 유지한다. 판매량 WAPE 승격 정책은 후속 변경이 필요하다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mlflow
import mlflow.tensorflow
import numpy as np
import pandas as pd
from mlflow.tracking import MlflowClient
from tensorflow import keras

from data.features import (
    SEQ_LEN, SalesScaler, build_sequences,
)
from data.storage import latest_upload
from serving_app.lstm_model import build_model
from serving_app.model_loader import MLFLOW_MODEL_URI, SCALER_PATH, validate_sales_model
from serving_app.monitoring.drift_detector import WINDOW_SIZE

# 기존 운영 학습과 같은 시드 및 학습 설정을 유지한다.
SEED = 42
keras.utils.set_random_seed(SEED)

RMSE_GATE = 4.00
MODEL_NAME = MLFLOW_MODEL_URI.removeprefix("models:/").rsplit("/", 1)[0]
BASE_EPOCHS = 100  # 기존 운영 학습 횟수 유지
FINE_TUNE_EPOCHS = 10
FINE_TUNE_LR = 1e-4  # base 학습(1e-3)보다 낮은 학습률로 살짝만 갱신


def rmse(y_true, y_pred) -> float:
    return float(np.sqrt(np.mean((np.array(y_true) - np.array(y_pred)) ** 2)))


def _prepare(rows, scaler: SalesScaler, last_n_rows: int | None = None):
    frame = pd.DataFrame(rows)
    X, y, dates, _ = build_sequences(frame, scaler, last_n_rows=last_n_rows)
    if not len(y):
        raise ValueError("학습용 20일 시퀀스를 만들 판매량 데이터가 부족합니다.")
    split_dates = np.sort(frame["Date"].unique() if last_n_rows is None else np.unique(dates))
    split_date = split_dates[int(len(split_dates) * 0.8)]
    tr, te = dates < split_date, dates >= split_date
    if not tr.any() or not te.any():
        raise ValueError("학습과 검증 구간에 20일 이후의 판매량 타깃이 필요합니다.")
    y_train_scaled = np.asarray(scaler.scale("Sales_Qty", y[tr]), dtype="float32")
    return X[tr], y_train_scaled, X[te], y[te]


def _register_if_gate_passed(model, run_id: str, score: float) -> dict:
    result = {"run_id": run_id, "rmse": score, "promoted": False}
    if score <= RMSE_GATE:
        v = mlflow.register_model(f"runs:/{run_id}/model", MODEL_NAME)
        MlflowClient().transition_model_version_stage(name=MODEL_NAME, version=v.version, stage="Production")
        result["promoted"] = True
        result["version"] = v.version
        print(f"[GATE PASSED] rmse={score:.2f} -> {MODEL_NAME} v{v.version} promoted to Production")
    else:
        print(f"[GATE FAILED] rmse={score:.2f} > {RMSE_GATE} -> 배포 차단, 기존 Production 유지")
    return result


def train_and_register(csv_path: str | None = None, rows: list[dict] | None = None) -> dict:
    """Day2: 처음부터(scratch) 학습. 데이터가 충분한 base 학습에서만 사용합니다.

    csv_path나 rows를 지정하지 않으면 최신 CSV를 사용한다.
    판매량 업로드 API와 WAPE 승격 정책은 후속 연결이 필요하다.
    """
    if rows is None:
        rows = pd.read_csv(csv_path or latest_upload())
    scaler = SalesScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test = _prepare(rows, scaler)

    with mlflow.start_run(run_name="base-train"):
        model = build_model()
        validate_sales_model(model)
        model.fit(X_train, y_train_scaled, epochs=BASE_EPOCHS, verbose=0)

        preds = scaler.inverse_sales(model.predict(X_test, verbose=0).flatten())
        score = rmse(y_test, preds)

        mlflow.log_param("mode", "scratch")
        mlflow.log_param("epochs", BASE_EPOCHS)
        mlflow.log_metric("rmse", score)
        mlflow.tensorflow.log_model(model, name="model", input_example=X_train[:1])

        return _register_if_gate_passed(model, mlflow.active_run().info.run_id, score)


def fine_tune(rows: list[dict]) -> dict:
    """
    Day3: 현재 Production 모델 가중치에서 이어서(warm start), 넘겨받은 rows(최근 데이터)로
    짧게 fine-tuning합니다. rows가 적을 때(예: 최근 1개월)도 스크래치 학습보다 훨씬 안정적입니다.
    """
    frame = pd.DataFrame(rows)
    required = SEQ_LEN + WINDOW_SIZE
    scaler = SalesScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test = _prepare(frame, scaler, last_n_rows=required)

    model = mlflow.tensorflow.load_model(f"models:/{MODEL_NAME}/Production")
    validate_sales_model(model)
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=FINE_TUNE_LR), loss="mse")

    with mlflow.start_run(run_name="fine-tune"):
        model.fit(X_train, y_train_scaled, epochs=FINE_TUNE_EPOCHS, verbose=0)

        preds = scaler.inverse_sales(model.predict(X_test, verbose=0).flatten())
        score = rmse(y_test, preds)

        mlflow.log_param("mode", "fine-tune")
        mlflow.log_param("epochs", FINE_TUNE_EPOCHS)
        mlflow.log_param("n_rows", len(rows))
        mlflow.log_metric("rmse", score)
        mlflow.tensorflow.log_model(model, name="model", input_example=X_train[:1])

        return _register_if_gate_passed(model, mlflow.active_run().info.run_id, score)


if __name__ == "__main__":
    train_and_register()
