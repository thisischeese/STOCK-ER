"""판매량 단건 예측과 플랫폼별 시퀀스 배치 검증 API."""
from datetime import timedelta
from threading import Lock

import pandas as pd

from fastapi import APIRouter

from data.features import PLATFORMS, SEQ_LEN, build_sequences
from serving_app import model_loader
from serving_app.schemas import PredictRequest, PredictResponse, BatchTestRequest, BatchTestResponse
from serving_app.monitoring.drift_detector import WINDOW_SIZE
from serving_app.monitoring.retrain_trigger import check_and_trigger

router = APIRouter()

# Day3: 최근 예측 기록(actual/predicted)을 쌓아두는 슬라이딩 윈도우.
# monitoring/drift_detector.py의 WINDOW_SIZE(21)만큼만 유지한다.
recent_predictions: list[dict] = []
_batch_lock = Lock()  # 배치 예측·재학습·캐시 교체 동안 모델별 기록이 섞이지 않도록 한다.

@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    model = model_loader.get_model()
    sequence = [p.model_dump(mode="json") for p in req.sequence]
    predicted = model.predict_one(sequence)
    return PredictResponse(
        platform=req.sequence[0].Platform,
        prediction_date=req.sequence[-1].Date + timedelta(days=1),
        predicted_sales_qty=round(predicted, 2), model_version=model.version,
    )


@router.post("/predict/batch-test", response_model=BatchTestResponse)
def batch_test(req: BatchTestRequest):
    """
    판매량 rows를 플랫폼별 20일 시퀀스로 나누고 다음 행의 실제 판매량과 비교한다.
    아래 원래 실습 TODO는 보존한다.

    TODO(Day3):
      1) req.prices 에서 길이 SEQ_LEN짜리 슬라이딩 윈도우를 만들어 각 윈도우 다음의
         실제 가격(actual)을 예측(predicted)과 함께 얻으세요.
         (거래량은 SIMULATED_VOLUME 고정값을 사용하면 됩니다 - 실전 피처와 100% 동일하지
          않아도 시뮬레이션 목적에는 충분합니다.)
      2) 예측 결과를 {"predicted": ..., "actual": ...} 형태로 recent_predictions 에 누적하세요.
      3) check_and_trigger(recent_predictions) 를 호출해 드리프트 여부를 확인하세요.
    """
    with _batch_lock:
        model = model_loader.get_model()
        # --- 여기부터 TODO ---
        # prices = req.prices
        # for i in range(len(prices) - SEQ_LEN):
        #     window = prices[i : i + SEQ_LEN]
        #     sequence = [{"close": p, "volume": SIMULATED_VOLUME} for p in window]
        #     pred = model.predict_one(sequence)
        #     actual = prices[i + SEQ_LEN]
        #     predictions.append(pred)
        #     recent_predictions.append({"predicted": pred, "actual": actual})
        # recent_predictions[:] = recent_predictions[-21:]  # WINDOW_SIZE 유지
        frame = pd.DataFrame([row.model_dump(mode="json") for row in req.rows])
        # 입력은 i ~ i+SEQ_LEN-1, 정답은 그 다음 칸(i+SEQ_LEN) - 한 칸만 어긋나도 정답이 입력에 섞인다
        X, y, dates, platforms = build_sequences(frame, model.scaler)
        values = model.predict_batch(X)
        records = [
            {"platform": platform, "date": str(date), "actual": float(actual),
             "predicted": float(predicted), "model_version": model.version}
            for platform, date, actual, predicted in zip(platforms, dates, y, values)
        ]
        predictions = [
            {"platform": record["platform"], "date": record["date"],
             "actual_sales_qty": int(record["actual"]),
             "predicted_sales_qty": round(record["predicted"], 2)}
            for record in records
        ]
        history = {(record["platform"], record["date"]): record
                   for record in recent_predictions if record["model_version"] == model.version}
        history.update({(record["platform"], record["date"]): record for record in records})
        recent_predictions[:] = [
            record for platform in PLATFORMS
            for record in sorted(
                (r for r in history.values() if r["platform"] == platform), key=lambda r: r["date"]
            )[-WINDOW_SIZE:]
        ]
        # --- 여기까지 TODO ---

        drift_check = check_and_trigger(recent_predictions)
        return BatchTestResponse(predictions=predictions, model_version=model.version, drift_check=drift_check)
