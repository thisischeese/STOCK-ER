"""
Day3: 드리프트 감지 -> fine-tuning 재학습 -> 재배포를 잇는 파이프라인의 핵심 조립 지점.

흐름: 이상 탐지(RMSE>$4) -> 알림 -> 최근 1개월 데이터 수집 ->
      Production 가중치에서 이어서 fine-tuning(warm start) -> 게이트 재검증 ->
      Production 재배포 (통과 못하면 기존 버전 유지)

왜 "처음부터 재학습"이 아니라 fine-tuning인가: 최근 1개월(21거래일)만으로 LSTM을
스크래치로 학습시키기엔 샘플이 너무 적어 불안정합니다. 이미 3년 전체로 학습된
Production 가중치에서 이어서 짧게(10 epoch) 미세조정하는 쪽이 훨씬 안정적입니다.

데이터는 data/uploads/에 업로드된 파일 중 가장 최근 것을 사용합니다(data/storage.py의
latest_upload() - Day2 train_and_register()가 쓰는 것과 같은 소스).
"""
import logging

from serving_app import model_loader
from serving_app.monitoring.drift_detector import WINDOW_SIZE, is_drift

logger = logging.getLogger("aiops")


def check_and_trigger(recent_predictions: list[dict]) -> dict:
    if not is_drift(recent_predictions):
        return {"status": "ok"}

    logger.warning("[WARN] drift detected - triggering retrain")

    # 재학습이 필요할 때만 불러온다. 모듈 상단에서 import하면 train_and_register가
    # tensorflow·mlflow를 서버 시작 시점에 끌어와 Day1 Lazy/Eager 비교가 무의미해진다.
    from data.features import load_rows, SEQ_LEN
    from data.storage import latest_upload
    from serving_app.train_and_register import fine_tune

    logger.info("[INFO] retrain triggered (window=last_21_days)")
    # 21건을 예측하려면 앞에 SEQ_LEN(20)행이 더 필요하다 (21행만 자르면 시퀀스가 1개뿐)
    rows = load_rows(latest_upload())[-(WINDOW_SIZE + SEQ_LEN):]
    # 41행으로 처음부터 학습하면 불안정하므로 Production 가중치에서 이어서 학습(warm start)
    result = fine_tune(rows)
    if result["promoted"]:
        logger.info(f"[OK] new_rmse={result['rmse']:.2f} - production promoted: HAIC_Predictor v{result['version']}")
        model_loader.invalidate_cache()  # 재배포 반영: 다음 /predict가 새 Production을 로드한다
        return {"status": "retrain_triggered", "promoted": True, "rmse": result["rmse"]}
    return {"status": "retrain_triggered", "promoted": False, "rmse": result["rmse"]}
