"""
Day3: RMSE 기반 데이터 드리프트 판정.

판단 기준 - 최근 WINDOW_SIZE(21)건의 (predicted, actual) 쌍으로 RMSE를 계산해
RMSE_THRESHOLD($4.00)와 비교한다. 너무 짧은 윈도우는 노이즈에 민감하고,
너무 긴 윈도우는 드리프트 반응이 느려진다 - 21은 "최근 한 달 거래일" 근사치로 정한 절충점.
"""
import math

RMSE_THRESHOLD = 4.00
WINDOW_SIZE = 21  # 최근 21건 기준


def compute_rmse(recent_predictions: list[dict]) -> float:
    """
    recent_predictions: [{"predicted": float, "actual": float}, ...]

    RMSE = sqrt( mean( (actual - predicted) ** 2 ) )
    빈 리스트는 드리프트가 없는 것으로 보고 0.0을 반환한다.
    """
    if not recent_predictions:
        return 0.0
    errors_sq = [(p["actual"] - p["predicted"]) ** 2 for p in recent_predictions]
    return math.sqrt(sum(errors_sq) / len(errors_sq))


def is_drift(recent_predictions: list[dict]) -> bool:
    if len(recent_predictions) < WINDOW_SIZE:
        return False  # 아직 판단할 만큼 데이터가 쌓이지 않음
    window = recent_predictions[-WINDOW_SIZE:]
    rmse = compute_rmse(window)
    return rmse > RMSE_THRESHOLD
