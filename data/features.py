"""판매량 학습과 서빙에서 공유할 20일 x 11피처 전처리.

CSV 컬럼은 Date, Platform, Sales_Qty, Orders, Fast_Delivery, Fast_Days,
Active_SKU, Promo이다. FEATURE_NAMES와 PLATFORMS의 순서가 모델 입력 순서다.
SalesScaler는 baseline 학습 구간으로만 fit하고 검증, 재학습, 서빙에서 재사용한다.
이 모듈은 TensorFlow나 모델 학습에 의존하지 않는다.
"""
import math
import pickle

import numpy as np
import pandas as pd


SEQ_LEN = 20
PLATFORMS = ["brandi", "zigzag", "ably"]
FEATURE_NAMES = (
    "sales_qty", "orders", "fast_delivery", "fast_days",
    "weekday_sin", "weekday_cos", "active_sku", "promo",
    "platform_brandi", "platform_zigzag", "platform_ably",
)
N_FEATURES = len(FEATURE_NAMES)


class SalesScaler:
    """log1p 판매 수량과 주문 건수를 [0, 1]로 정규화. 학습 구간에서 한 번만 fit하고 재학습 때도 유지한다.

    fit에는 baseline 학습 구간만 전달한다. feature_matrix/build_sequences는
    fit을 호출하지 않는다. 학습한 인스턴스는 pickle로 직렬화해 재사용할 수 있다.
    """

    def fit(self, df: pd.DataFrame) -> "SalesScaler":
        self.lo = {c: math.log1p(df[c].min()) for c in ("Sales_Qty", "Orders")}
        self.hi = {c: math.log1p(df[c].max()) for c in ("Sales_Qty", "Orders")}
        return self

    def scale(self, col: str, v):
        return (np.log1p(v) - self.lo[col]) / (self.hi[col] - self.lo[col])

    def inverse_sales(self, s):
        return np.expm1(s * (self.hi["Sales_Qty"] - self.lo["Sales_Qty"]) + self.lo["Sales_Qty"])

    def save(self, path):
        """baseline 학습 구간으로 fit한 범위와 11피처 계약을 지정한 경로에 저장한다."""
        if not hasattr(self, "lo") or not hasattr(self, "hi"):
            raise ValueError("baseline 학습 구간으로 fit한 SalesScaler만 저장할 수 있습니다.")
        payload = {
            "format_version": 1,
            "seq_len": SEQ_LEN,
            "feature_names": FEATURE_NAMES,
            "platforms": tuple(PLATFORMS),
            "lo": self.lo,
            "hi": self.hi,
        }
        with open(path, "wb") as file:
            pickle.dump(payload, file)

    @classmethod
    def load(cls, path) -> "SalesScaler":
        """11피처 메타데이터가 일치하는 scaler만 읽고 주가용 산출물은 거부한다."""
        with open(path, "rb") as file:
            payload = pickle.load(file)
        columns = {"Sales_Qty", "Orders"}
        if (
            not isinstance(payload, dict)
            or payload.get("format_version") != 1
            or payload.get("seq_len") != SEQ_LEN
            or payload.get("feature_names") != FEATURE_NAMES
            or payload.get("platforms") != tuple(PLATFORMS)
            or not isinstance(payload.get("lo"), dict)
            or not isinstance(payload.get("hi"), dict)
            or set(payload["lo"]) != columns
            or set(payload["hi"]) != columns
        ):
            raise ValueError(
                "판매량 20일, 11피처 scaler와 호환되지 않는 파일입니다. "
                "기존 주가용 2피처 scaler를 재사용할 수 없으므로 판매량 baseline scaler가 필요합니다."
            )
        scaler = cls()
        scaler.lo = payload["lo"]
        scaler.hi = payload["hi"]
        return scaler


def feature_matrix(df: pd.DataFrame, scaler: SalesScaler) -> np.ndarray:
    """행 순서를 유지해 (행 수, 11) float32 피처를 만든다.

    서빙에서는 한 플랫폼의 날짜순 20행을 전달해 (20, 11) 입력을 만든다.
    날짜 정렬과 플랫폼별 학습 시퀀스 구성은 build_sequences가 담당한다.
    """
    dow = pd.to_datetime(df["Date"]).dt.dayofweek.to_numpy()
    onehot = np.stack([(df["Platform"] == p).to_numpy(dtype=float) for p in PLATFORMS], axis=1)
    return np.column_stack([
        scaler.scale("Sales_Qty", df["Sales_Qty"].to_numpy()),
        scaler.scale("Orders", df["Orders"].to_numpy()),
        df["Fast_Delivery"].to_numpy(dtype=float),
        np.minimum(df["Fast_Days"].to_numpy(), 28) / 28,
        np.sin(2 * np.pi * dow / 7),
        np.cos(2 * np.pi * dow / 7),
        df["Active_SKU"].to_numpy() / 20,
        df["Promo"].to_numpy(dtype=float),
        onehot,
    ]).astype("float32")


def build_sequences(df: pd.DataFrame, scaler: SalesScaler, last_n_rows: int | None = None):
    """플랫폼별로 (20일 피처 → 다음 날 판매) 시퀀스를 만든다. 반환 : X, y(실제 수량), 타깃 날짜, 플랫폼.

    PLATFORMS 순서로 묶고 각 플랫폼 안에서는 날짜순으로 정렬한다.
    last_n_rows는 플랫폼마다 적용한다. 네 반환 배열의 같은 인덱스는
    같은 예측을 가리킨다. X의 각 시퀀스 뒤 날짜의 판매 수량이 y다.
    """
    X, y, dates, plats = [], [], [], []
    for p in PLATFORMS:
        part = df[df["Platform"] == p].sort_values("Date")
        if last_n_rows:
            part = part.tail(last_n_rows)
        feats = feature_matrix(part, scaler)
        sales = part["Sales_Qty"].to_numpy()
        d = part["Date"].to_numpy()
        for i in range(len(part) - SEQ_LEN):
            X.append(feats[i : i + SEQ_LEN])
            y.append(sales[i + SEQ_LEN])
            dates.append(d[i + SEQ_LEN])
            plats.append(p)
    return np.array(X), np.array(y, dtype=float), np.array(dates), np.array(plats)
