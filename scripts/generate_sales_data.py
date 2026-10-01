"""
조별 미니 프로젝트: 업무 규칙 기반 쇼핑몰 판매량 합성 데이터 생성기.

동대문 사입 상품 20개를 브랜디·지그재그·에이블리에 동시에 판매하는 소규모 쇼핑몰의
플랫폼별 일 판매량을 만든다. 실제 데이터는 쓰지 않고, 아래 업무 규칙만으로 생성한다.

    판매 수량 = 플랫폼 기본 판매량 × 요일 계수 × 계절 계수 × 상품 매력도
              × 행사 배율 × 빠른 배송 효과 × 잡음

- 요일 계수 : 빠른 배송 전에는 월요일 쏠림·주말 약세, 빠른 배송 후에는 주말 강세
              (지그재그 주 7일 배송 사례 : 목·금 감소 사라짐, 토·일 거래액 +32%)
- 빠른 배송 : 플랫폼마다 다른 날짜에 붙고, 효과 크기와 적응 기간도 다르다
- 상품 매력도 : 20개 상품 슬롯이 출시 → 정점 → 하락 주기로 교체되고, 품절·사입 대기로
                판매 중 상품 수(Active_SKU)가 12~20개 사이에서 움직인다

출력 (data/synthetic/) - 모든 파일은 같은 730일 기본 이력을 공유한다.
    sales_base.csv                 기본 이력 730일 (2024-10-01 ~ 2026-09-30)
    sales_normal.csv               기본 이력 + 정상 21일
    sales_drift_brandi.csv        기본 이력 + 브랜디 빠른 배송 입점 21일 (주 시나리오)
    sales_drift_brandi_next.csv   위 시나리오 + 다음 21일 (재학습 후 확인용)
    sales_drift_viral.csv          기본 이력 + 바이럴로 변동 폭이 커진 21일 (보조 시나리오)

시나리오 구간이 21일인 이유 : 드리프트 판정 배치는 41행(시퀀스 20일 + 판정 21일)이다.
업로드 파일의 최근 41행이 "변화 전 20일 + 변화 후 21일"이 되어, 감지에 쓴 데이터와
재학습 데이터가 같아진다.

실행 (프로젝트 루트에서):
    python scripts/generate_sales_data.py
"""
import argparse
import csv
import datetime as dt
import math
import os

import numpy as np

OUT_DIR = "data/synthetic"
COLUMNS = ["Date", "Platform", "Sales_Qty", "Orders", "Fast_Delivery", "Fast_Days", "Active_SKU", "Promo"]

START_DATE = dt.date(2024, 10, 1)
BASE_DAYS = 730          # 2024-10-01 ~ 2026-09-30
SCENARIO_DAYS = 21       # 판정 윈도우(WINDOW_SIZE)와 같은 길이
FUTURE_DAYS = SCENARIO_DAYS * 2

PLATFORMS = ["brandi", "zigzag", "ably"]
BASE_LEVEL = {"brandi": 40.0, "zigzag": 35.0, "ably": 25.0}

# 월 ~ 일. 평균이 1이 되도록 정규화해, 요일 패턴 변화가 총량을 바꾸지 않게 한다.
DOW_PRE = np.array([1.25, 1.10, 1.00, 0.90, 0.80, 0.75, 0.95])
DOW_POST = np.array([1.00, 1.05, 1.00, 1.05, 1.00, 1.25, 1.50])
DOW_PRE = DOW_PRE / DOW_PRE.mean()
DOW_POST = DOW_POST / DOW_POST.mean()

SEASON_AMP = 0.10        # 봄(4월)·가을(10월) 성수기 ±10%

# (시작 월, 시작 일, 기간, 배율) - 모든 플랫폼이 참여하는 기획전
PROMOS = [(11, 18, 14, 1.8), (6, 15, 7, 1.5)]

# 기본 이력 안의 빠른 배송 입점 : 플랫폼 -> (입점일, 효과 배율, 적응 기간)
FAST_BASE = {
    "zigzag": (dt.date(2025, 10, 1), 1.5, 21),
    "ably": (dt.date(2026, 4, 4), 1.3, 21),
}
# 주 시나리오 : 브랜디는 앞의 두 플랫폼보다 효과가 더 크고 빠르게 나타난다고 가정
# (×2.5 = +150%. 지그재그 주 7일 배송 때 몰별 증가율이 135% ~ 2,862%로 보도된 범위 안)
FAST_BRANDI = ("brandi", dt.date(2026, 10, 1), 2.5, 7)

NOISE_SD = 0.08
VIRAL_NOISE_SD = 0.30
ITEMS_PER_ORDER = (1.2, 1.6)

N_SKU = 20
SKU_LIFE = (60, 90)      # 상품 하나의 판매 기간(일)
SKU_GAP = (0, 14)        # 다음 상품을 사입해 올리기까지 빈 기간(일)


def simulate_sku_attractiveness(n_days: int, rng: np.random.Generator):
    """20개 상품 슬롯의 출시 → 정점 → 하락 주기를 만들고, 일별 매력도 합과 판매 중 상품 수를 돌려준다."""
    attract = np.zeros(n_days)
    active = np.zeros(n_days, dtype=int)
    for _ in range(N_SKU):
        day = -int(rng.integers(0, SKU_LIFE[1]))  # 슬롯마다 주기를 어긋나게 시작
        while day < n_days:
            life = int(rng.integers(SKU_LIFE[0], SKU_LIFE[1] + 1))
            peak = rng.uniform(0.6, 1.4)
            for age in range(life):
                d = day + age
                if 0 <= d < n_days:
                    if age < 7:
                        w = peak * (age + 1) / 7                      # 출시 직후 상승
                    elif age < life * 0.6:
                        w = peak                                       # 정점 유지
                    else:
                        w = peak * (1 - 0.8 * (age - life * 0.6) / (life * 0.4))  # 하락
                    attract[d] += w
                    active[d] += 1
            day += life + int(rng.integers(SKU_GAP[0], SKU_GAP[1] + 1))
    return attract, active


def season_factor(d: dt.date) -> float:
    doy = d.timetuple().tm_yday
    return 1 + SEASON_AMP * math.cos(4 * math.pi * (doy - 105) / 365)


def promo_factor(d: dt.date) -> tuple[float, int]:
    for month, day, length, mult in PROMOS:
        start = dt.date(d.year, month, day)
        if start <= d < start + dt.timedelta(days=length):
            return mult, 1
    return 1.0, 0


def build_world(seed: int) -> dict:
    """모든 시나리오가 공유하는 잠재 요인(상품 주기, 잡음, 주문당 수량)을 한 번만 뽑는다."""
    rng = np.random.default_rng(seed)
    n_days = BASE_DAYS + FUTURE_DAYS
    attract, active = simulate_sku_attractiveness(n_days, rng)
    attract = attract / attract[:BASE_DAYS].mean()  # 기본 이력 평균이 1이 되도록
    return {
        "n_days": n_days,
        "attract": attract,
        "active": active,
        "z": rng.standard_normal((n_days, len(PLATFORMS))),
        "items_per_order": rng.uniform(*ITEMS_PER_ORDER, size=(n_days, len(PLATFORMS))),
    }


def generate(world: dict, n_days: int, fast_events: dict, viral_from: dt.date | None = None) -> list[dict]:
    rows = []
    for i in range(n_days):
        d = START_DATE + dt.timedelta(days=i)
        promo_mult, promo_flag = promo_factor(d)
        for j, platform in enumerate(PLATFORMS):
            fast_flag, fast_days, level, dow = 0, 0, 1.0, DOW_PRE[d.weekday()]
            if platform in fast_events:
                start, mult, ramp_days = fast_events[platform]
                if d >= start:
                    fast_flag = 1
                    fast_days = (d - start).days + 1
                    ramp = min(fast_days / ramp_days, 1.0)
                    level = 1 + (mult - 1) * ramp
                    dow = DOW_PRE[d.weekday()] * (1 - ramp) + DOW_POST[d.weekday()] * ramp

            sd = VIRAL_NOISE_SD if viral_from and d >= viral_from else NOISE_SD
            noise = math.exp(sd * world["z"][i, j] - sd**2 / 2)
            mean = (BASE_LEVEL[platform] * dow * season_factor(d) * world["attract"][i]
                    * promo_mult * level)
            sales = max(0, round(mean * noise))
            orders = min(sales, max(1, round(sales / world["items_per_order"][i, j]))) if sales > 0 else 0
            rows.append({
                "Date": d.isoformat(),
                "Platform": platform,
                "Sales_Qty": sales,
                "Orders": orders,
                "Fast_Delivery": fast_flag,
                "Fast_Days": fast_days,
                "Active_SKU": int(world["active"][i]),
                "Promo": promo_flag,
            })
    return rows


def write_csv(rows: list[dict], name: str) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def main():
    parser = argparse.ArgumentParser(description="쇼핑몰 판매량 합성 데이터 생성")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    world = build_world(args.seed)
    brandi_events = {**FAST_BASE, FAST_BRANDI[0]: FAST_BRANDI[1:]}
    scenario_start = START_DATE + dt.timedelta(days=BASE_DAYS)

    outputs = {
        "sales_base.csv": generate(world, BASE_DAYS, FAST_BASE),
        "sales_normal.csv": generate(world, BASE_DAYS + SCENARIO_DAYS, FAST_BASE),
        "sales_drift_brandi.csv": generate(world, BASE_DAYS + SCENARIO_DAYS, brandi_events),
        "sales_drift_brandi_next.csv": generate(world, BASE_DAYS + FUTURE_DAYS, brandi_events),
        "sales_drift_viral.csv": generate(world, BASE_DAYS + SCENARIO_DAYS, FAST_BASE, viral_from=scenario_start),
    }
    for name, rows in outputs.items():
        path = write_csv(rows, name)
        print(f"{path}: {len(rows)}행 ({rows[0]['Date']} ~ {rows[-1]['Date']})")


if __name__ == "__main__":
    main()
