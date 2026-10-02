"""판매량 20일 x 11피처 학습 및 warm start 연결.

baseline의 sales_scaler.pkl을 고정 재사용하고 날짜 기준으로 학습과 검증을 나눈다.
운영 LSTM, MSE와 기존 학습 설정은 유지한다. RMSE는 판매 수량의 진단 지표다.
같은 검증 구간에서 플랫폼별 WAPE가 20% 이하고 기존 모델보다 나쁘지 않을 때 승격한다.
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
from data.storage import latest_upload, load_sales_data
from serving_app.lstm_model import build_model
from serving_app.model_loader import MLFLOW_MODEL_URI, SCALER_PATH, get_model, validate_sales_model
from serving_app.monitoring.drift_detector import WINDOW_SIZE, WAPE_THRESHOLD, wape

# 기존 운영 학습과 같은 시드 및 학습 설정을 유지한다.
SEED = 42
keras.utils.set_random_seed(SEED)

MODEL_NAME = MLFLOW_MODEL_URI.removeprefix("models:/").rsplit("/", 1)[0]
BASE_EPOCHS = 100  # 기존 운영 학습 횟수 유지
FINE_TUNE_EPOCHS = 10
FINE_TUNE_LR = 1e-4  # base 학습(1e-3)보다 낮은 학습률로 살짝만 갱신


def rmse(y_true, y_pred) -> float:
    return float(np.sqrt(np.mean((np.array(y_true) - np.array(y_pred)) ** 2)))


def _prepare(rows, scaler: SalesScaler, last_n_rows: int | None = None):
    frame = pd.DataFrame(rows)
    X, y, dates, platforms = build_sequences(frame, scaler, last_n_rows=last_n_rows)
    if not len(y):
        raise ValueError("학습용 20일 시퀀스를 만들 판매량 데이터가 부족합니다.")
    split_dates = np.sort(frame["Date"].unique() if last_n_rows is None else np.unique(dates))
    split_date = split_dates[int(len(split_dates) * 0.8)]
    tr, te = dates < split_date, dates >= split_date
    if not tr.any() or not te.any():
        raise ValueError("학습과 검증 구간에 20일 이후의 판매량 타깃이 필요합니다.")
    y_train_scaled = np.asarray(scaler.scale("Sales_Qty", y[tr]), dtype="float32")
    return X[tr], y_train_scaled, X[te], y[te], platforms[te]



def _scores(y, predicted, old_predicted, platforms) -> dict:
    by_platform = {}
    for platform in np.unique(platforms):
        mask = platforms == platform
        by_platform[str(platform)] = {
            "wape": wape(y[mask], predicted[mask]),
            "old_wape": wape(y[mask], old_predicted[mask]),
            "rmse": rmse(y[mask], predicted[mask]),
        }
    return {
        "wape": wape(y, predicted), "old_wape": wape(y, old_predicted),
        "rmse": rmse(y, predicted), "platforms": by_platform,
    }


def _log_scores(scores):
    for name in ("wape", "old_wape", "rmse"):
        mlflow.log_metric(name, scores[name])
    for platform, metrics in scores["platforms"].items():
        for name, value in metrics.items():
            mlflow.log_metric(f"{platform}_{name}", value)


def _register_if_gate_passed(model, run_id: str, scores: dict) -> dict:
    result = {"run_id": run_id, **scores, "promoted": False}
    passed = bool(scores["platforms"]) and all(
        metrics["wape"] <= WAPE_THRESHOLD and metrics["wape"] <= metrics["old_wape"]
        for metrics in scores["platforms"].values()
    )
    if passed:
        version = mlflow.register_model(f"runs:/{run_id}/model", MODEL_NAME)
        MlflowClient().transition_model_version_stage(
            name=MODEL_NAME, version=version.version, stage="Production", archive_existing_versions=True)
        result["promoted"] = True
        result["version"] = version.version
        print(f"[GATE PASSED] wape={scores['wape']:.1%} -> {MODEL_NAME} v{version.version}")
    else:
        print(f"[GATE FAILED] wape={scores['wape']:.1%} - 플랫폼별 기준 또는 개선 조건 미달")
    return result


def train_and_register(csv_path: str | None = None, rows: list[dict] | None = None) -> dict:
    """Day2: 처음부터(scratch) 학습. 데이터가 충분한 base 학습에서만 사용합니다.

    csv_path나 rows를 지정하지 않으면 최신 CSV를 사용한다.
    현재 서빙 모델과 같은 검증 구간을 비교한다.
    """
    if rows is None:
        rows = load_sales_data(csv_path or latest_upload())
    scaler = SalesScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test, platforms = _prepare(rows, scaler)
    reference = get_model()
    old_preds = reference.predict_batch(X_test)

    with mlflow.start_run(run_name="base-train"):
        model = build_model()
        validate_sales_model(model)
        model.fit(X_train, y_train_scaled, epochs=BASE_EPOCHS, verbose=0)

        preds = scaler.inverse_sales(model.predict(X_test, verbose=0).flatten())
        scores = _scores(y_test, preds, old_preds, platforms)

        mlflow.log_param("mode", "scratch")
        mlflow.log_param("epochs", BASE_EPOCHS)
        _log_scores(scores)
        mlflow.tensorflow.log_model(model, name="model", input_example=X_train[:1])

        return _register_if_gate_passed(model, mlflow.active_run().info.run_id, scores)


def fine_tune(rows: list[dict]) -> dict:
    """
    Day3: 현재 Production 모델 가중치에서 이어서(warm start), 넘겨받은 rows(최근 데이터)로
    짧게 fine-tuning합니다. rows가 적을 때(예: 최근 1개월)도 스크래치 학습보다 훨씬 안정적입니다.
    """
    frame = pd.DataFrame(rows)
    required = SEQ_LEN + WINDOW_SIZE
    scaler = SalesScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test, platforms = _prepare(frame, scaler, last_n_rows=required)

    reference = mlflow.tensorflow.load_model(f"models:/{MODEL_NAME}/Production")
    validate_sales_model(reference)
    old_preds = scaler.inverse_sales(reference.predict(X_test, verbose=0).flatten())
    model = keras.models.clone_model(reference)
    model.set_weights(reference.get_weights())
    validate_sales_model(model)
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=FINE_TUNE_LR), loss="mse")

    with mlflow.start_run(run_name="fine-tune"):
        model.fit(X_train, y_train_scaled, epochs=FINE_TUNE_EPOCHS, verbose=0)

        preds = scaler.inverse_sales(model.predict(X_test, verbose=0).flatten())
        scores = _scores(y_test, preds, old_preds, platforms)

        mlflow.log_param("mode", "fine-tune")
        mlflow.log_param("epochs", FINE_TUNE_EPOCHS)
        mlflow.log_param("n_rows", len(rows))
        _log_scores(scores)
        mlflow.tensorflow.log_model(model, name="model", input_example=X_train[:1])

        return _register_if_gate_passed(model, mlflow.active_run().info.run_id, scores)


if __name__ == "__main__":
    train_and_register()
