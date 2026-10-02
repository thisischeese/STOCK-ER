"""플랫폼별 WAPE 드리프트 감지 후 판매량 최근 41행으로 warm start를 호출한다."""
import logging
import os

from serving_app.monitoring.drift_detector import WINDOW_SIZE, drift_report

logger = logging.getLogger("aiops")


def check_and_trigger(recent_predictions: list[dict]) -> dict:
    report = drift_report(recent_predictions)
    if not any(metrics["drift"] for metrics in report.values()):
        return {"status": "ok", "platforms": report}

    logger.warning("[WARN] drift detected - triggering retrain")

    # TODO(Day3, 핵심 실습):
    #   1) 최근 1개월(21거래일) + 시퀀스 구성용 선행 SEQ_LEN(20)일을 조회하세요.
    #      -> data/storage.py의 latest_upload()로 업로드된 최신 CSV 경로를 얻고,
    #         data/features.py의 load_rows(경로)로 원본을 불러와 최근 (21+SEQ_LEN)행만
    #         슬라이싱하세요.
    #   2) Day2에서 작성한 serving_app.train_and_register.fine_tune(rows) 를 호출해
    #      Production 가중치에서 이어서 재학습하세요 (처음부터 다시 학습하지 않습니다).
    #   3) 반환된 결과(dict)의 "promoted" 값을 확인해 게이트 통과 여부를 판단하세요.
    #
    # from data.features import load_rows, SEQ_LEN
    # from data.storage import latest_upload
    # from serving_app.train_and_register import fine_tune
    # logger.info("[INFO] retrain triggered (window=last_21_days)")
    # rows = load_rows(latest_upload())[-(21 + SEQ_LEN):]
    # result = fine_tune(rows)
    # if result["promoted"]:
    #     logger.info(f"[OK] new_rmse={result['rmse']:.2f} - production promoted: HAIC_Predictor v{result['version']}")
    #     return {"status": "retrain_triggered", "promoted": True, "rmse": result["rmse"]}
    # return {"status": "retrain_triggered", "promoted": False, "rmse": result["rmse"]}

    from data.features import SEQ_LEN
    from data.storage import load_sales_data, latest_upload
    from serving_app import model_loader

    try:
        frame = load_sales_data(latest_upload(), min_rows_per_platform=WINDOW_SIZE + SEQ_LEN)
        rows = frame.sort_values("Date").groupby("Platform", sort=False).tail(WINDOW_SIZE + SEQ_LEN)
        # 실제 드리프트가 있을 때만 무거운 학습 의존성을 로드한다.
        from serving_app.train_and_register import fine_tune

        logger.info("[INFO] retrain triggered (window=last_21_days)")
        result = fine_tune(rows)
        if result["promoted"]:
            # 로컬 baseline 모드는 유지하고 MLflow 서빙 모드에서만 캐시를 교체한다.
            # load_eager는 로딩이 성공한 뒤 캐시에 대입하므로 실패하면 기존 모델을 보존한다.
            if os.getenv("MODEL_SOURCE", "local") == "mlflow":
                model_loader.load_eager()
                recent_predictions.clear()  # 이전 모델의 오차를 새 모델의 감지에 섞지 않는다.
            logger.info(
                f"[OK] new_wape={result['wape']:.1%} - production promoted: Sales_Predictor v{result['version']}"
            )
        else:
            logger.warning(f"[GATE FAILED] new_wape={result['wape']:.1%} - existing model retained")
        return {"status": "retrain_triggered", "platforms": report, "training": result}
    except Exception:
        logger.exception("[ERROR] retrain or serving reload failed - existing serving model retained")
        raise
