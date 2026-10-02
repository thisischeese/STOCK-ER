"""판매량 baseline 학습. 공통 날짜 기준 앞 80%에만 scaler를 fit한다.

기존 운영 LSTM과 학습 설정은 유지하고 입력과 타깃을 판매량 계약으로 연결한다.
sales_scaler.pkl은 이후 학습과 서빙에서 다시 fit하지 않고 재사용한다.
실행: python scripts/train_baseline_v1.py (실제 학습과 새 판매량 파일 저장)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd

from data.features import SalesScaler, build_sequences
from serving_app.lstm_model import build_model
from serving_app.model_loader import LOCAL_MODEL_PATH, SCALER_PATH, validate_sales_model

MODEL_PATH = LOCAL_MODEL_PATH
BASE_DATA_PATH = "data/synthetic/sales_base.csv"
BASE_EPOCHS = 100  # 기존 운영 학습 횟수 유지


def rmse(y_true, y_pred) -> float:
    return (sum((a - b) ** 2 for a, b in zip(y_true, y_pred)) / len(y_true)) ** 0.5


def main(csv_path: str | None = None):
    frame = pd.read_csv(csv_path or BASE_DATA_PATH)
    dates = np.sort(frame["Date"].unique())
    split_date = dates[int(len(dates) * 0.8)]

    training_rows = frame[frame["Date"] < split_date]
    scaler = SalesScaler().fit(training_rows)

    X, y, dates, _ = build_sequences(frame, scaler)
    if not len(y):
        raise ValueError("학습용 20일 시퀀스를 만들 판매량 데이터가 부족합니다.")
    tr, te = dates < split_date, dates >= split_date
    if not tr.any() or not te.any():
        raise ValueError("학습과 검증 구간에 20일 이후의 판매량 타깃이 필요합니다.")
    X_train, X_test = X[tr], X[te]
    y_train, y_test = y[tr], y[te]
    # 입력 시퀀스와 같은 스케일로 학습해야 loss가 과도하게 커지지 않고 안정적으로 수렴한다.
    y_train_scaled = np.asarray(scaler.scale("Sales_Qty", y_train), dtype="float32")

    model = build_model()
    validate_sales_model(model)
    model.fit(X_train, y_train_scaled, epochs=BASE_EPOCHS, verbose=0)

    preds_scaled = model.predict(X_test, verbose=0).flatten()
    preds = scaler.inverse_sales(preds_scaled)
    score = rmse(y_test, preds)
    print(f"sales baseline RMSE = {score:.2f} (판매 수량, 승격 정책은 후속 전환 필요)")

    model.save(MODEL_PATH)
    scaler.save(SCALER_PATH)
    print(f"scaler fit on {len(training_rows)}행 -> {SCALER_PATH}")
    print(f"saved -> {MODEL_PATH}")


if __name__ == "__main__":
    main()
