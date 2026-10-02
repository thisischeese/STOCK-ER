"""플랫폼별 최근 21건의 판매량 WAPE가 20%를 넘으면 드리프트로 판정한다.

RMSE는 보조 지표로 기록한다.
"""
import math

WAPE_THRESHOLD = 0.20
WINDOW_SIZE = 21  # 최근 21건 기준


def compute_rmse(recent_predictions: list[dict]) -> float:
    """
    recent_predictions: [{"predicted": float, "actual": float}, ...]

    TODO(Day3, 핵심 실습): 아래 수식대로 RMSE를 직접 구현하세요.
        RMSE = sqrt( mean( (actual - predicted) ** 2 ) )

    빈 리스트가 들어오면 드리프트가 없다고 간주할 수 있도록 0.0을 반환하세요.
    """
    if not recent_predictions:
        return 0.0
    squared_errors = [(p["actual"] - p["predicted"]) ** 2 for p in recent_predictions]
    return math.sqrt(sum(squared_errors) / len(squared_errors))



def wape(actual, predicted) -> float:
    """판매 합계가 0이면 분모 1e-9를 사용한다. 실제와 예측이 모두 0이면 0이다."""
    actual, predicted = list(actual), list(predicted)
    if len(actual) != len(predicted):
        raise ValueError("WAPE 실제값과 예측값의 길이가 같아야 합니다.")
    error = sum(abs(a - p) for a, p in zip(actual, predicted))
    return float(error / max(sum(actual), 1e-9))


def compute_wape(recent_predictions: list[dict]) -> float:
    return wape([p["actual"] for p in recent_predictions],
                [p["predicted"] for p in recent_predictions])


def drift_report(recent_predictions: list[dict]) -> dict:
    from data.features import PLATFORMS

    report = {}
    for platform in PLATFORMS:
        records = [p for p in recent_predictions if p["platform"] == platform][-WINDOW_SIZE:]
        if records:
            score = compute_wape(records)
            report[platform] = {
                "count": len(records), "wape": score, "rmse": compute_rmse(records),
                "drift": len(records) == WINDOW_SIZE and score > WAPE_THRESHOLD,
            }
    return report


def is_drift(recent_predictions: list[dict]) -> bool:
    return any(metrics["drift"] for metrics in drift_report(recent_predictions).values())
