"""
합성 데이터 검증 : 설계한 LSTM(20일 × 11개 피처 → 다음 날 판매 수량)으로 학습해
1) 과적합이 없는지, 2) 정상/드리프트 배치가 WAPE로 구분되는지,
3) 재학습(warm start fine-tuning)이 효과가 있는지를 한 번에 확인한다.

serving_app 코드는 건드리지 않는 독립 검증 스크립트다. 피처 구성은 기획서 설계안을 따른다.

실행 (프로젝트 루트에서, generate_sales_data.py 실행 후):
    python scripts/validate_sales_data.py
"""
import math
import os
import time

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
import pandas as pd
from tensorflow import keras

DATA_DIR = "data/synthetic"
PLATFORMS = ["brandi", "zigzag", "ably"]
SEQ_LEN = 20
WINDOW = 21
DRIFT_THRESHOLD = 0.20      # WAPE 20%
TRAIN_RATIO = 0.8           # 기본 이력 앞 80% 학습, 뒤 20% 검증 (시간 순서 유지)
SAFETY = 1.1                # 사전 입고 = 예측 × 1.1
SEED = 42

keras.utils.set_random_seed(SEED)


class Scaler:
    """log1p 판매 수량·주문 건수를 [0, 1]로 정규화. 학습 구간에서 한 번만 fit하고 재학습 때도 유지한다."""

    def fit(self, df: pd.DataFrame) -> "Scaler":
        self.lo = {c: math.log1p(df[c].min()) for c in ("Sales_Qty", "Orders")}
        self.hi = {c: math.log1p(df[c].max()) for c in ("Sales_Qty", "Orders")}
        return self

    def scale(self, col: str, v):
        return (np.log1p(v) - self.lo[col]) / (self.hi[col] - self.lo[col])

    def inverse_sales(self, s):
        return np.expm1(s * (self.hi["Sales_Qty"] - self.lo["Sales_Qty"]) + self.lo["Sales_Qty"])


def feature_matrix(df: pd.DataFrame, scaler: Scaler) -> np.ndarray:
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


def sequences(df: pd.DataFrame, scaler: Scaler, last_n_rows: int | None = None):
    """플랫폼별로 (20일 피처 → 다음 날 판매) 시퀀스를 만든다. 반환 : X, y(실제 수량), 타깃 날짜, 플랫폼."""
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


def build_model(n_features: int) -> keras.Model:
    """GRU 32-16 + Dropout 0.1 구조 (이승민 최우수 모델 후보)."""
    model = keras.Sequential([
        keras.layers.Input(shape=(SEQ_LEN, n_features)),
        keras.layers.GRU(32, return_sequences=True),
        keras.layers.Dropout(0.1),
        keras.layers.GRU(16),
        keras.layers.Dropout(0.1),
        keras.layers.Dense(16, activation="relu"),
        keras.layers.Dense(1),
    ])
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="mae")
    return model


def wape(actual, pred) -> float:
    return float(np.abs(actual - pred).sum() / max(actual.sum(), 1e-9))


def predict_qty(model, X, scaler) -> np.ndarray:
    return scaler.inverse_sales(model.predict(X, verbose=0).flatten())


def stock_impact(actual, pred) -> tuple[int, int]:
    """사전 입고 = 예측 × 1.1 일 때 품절(부족) 수량과 과잉 수량."""
    stock = np.ceil(pred * SAFETY)
    return int(np.maximum(actual - stock, 0).sum()), int(np.maximum(stock - actual, 0).sum())


def judge_batch(model, scaler, path: str) -> dict:
    """업로드 파일의 플랫폼별 최근 41행(20 + 21)으로 21건 예측 → 플랫폼별 WAPE."""
    df = pd.read_csv(path)
    X, y, _, plats = sequences(df, scaler, last_n_rows=SEQ_LEN + WINDOW)
    pred = predict_qty(model, X, scaler)
    return {p: wape(y[plats == p], pred[plats == p]) for p in PLATFORMS}


def fine_tune(model, scaler, path: str, epochs: int, lr: float):
    """retrain_trigger 흐름 그대로 : 최근 41행으로 warm start, 시간순 8:2로 나눠 뒤 20%로 게이트 검증."""
    df = pd.read_csv(path)
    X, y, dates, plats = sequences(df, scaler, last_n_rows=SEQ_LEN + WINDOW)
    cut = np.sort(np.unique(dates))[int(WINDOW * TRAIN_RATIO)]
    tr, te = dates < cut, dates >= cut
    old_wape = wape(y[te], predict_qty(model, X[te], scaler))

    new = keras.models.clone_model(model)
    new.set_weights(model.get_weights())
    new.compile(optimizer=keras.optimizers.Adam(lr), loss="mae")
    y_scaled = scaler.scale("Sales_Qty", y)
    new.fit(X[tr], y_scaled[tr], epochs=epochs, batch_size=16, verbose=0)
    new_wape = wape(y[te], predict_qty(new, X[te], scaler))
    promoted = new_wape <= DRIFT_THRESHOLD and new_wape <= old_wape
    return new, old_wape, new_wape, promoted, int(te.sum())


def main():
    t0 = time.time()
    base = pd.read_csv(os.path.join(DATA_DIR, "sales_base.csv"))
    dates = np.sort(base["Date"].unique())
    split_date = dates[int(len(dates) * TRAIN_RATIO)]
    scaler = Scaler().fit(base[base["Date"] < split_date])

    X, y, tgt_dates, plats = sequences(base, scaler)
    tr, va = tgt_dates < split_date, tgt_dates >= split_date
    y_scaled = scaler.scale("Sales_Qty", y)
    print(f"[데이터] 학습 시퀀스 {tr.sum()}개, 검증 시퀀스 {va.sum()}개, 피처 {X.shape[2]}개 "
          f"(검증 구간 {split_date} ~ {dates[-1]})")

    # 1) 기본 학습 + 과적합 점검
    model = build_model(X.shape[2])
    early = keras.callbacks.EarlyStopping(monitor="val_loss", patience=15, restore_best_weights=True)
    hist = model.fit(X[tr], y_scaled[tr], validation_data=(X[va], y_scaled[va]),
                     epochs=200, batch_size=32, callbacks=[early], verbose=0)
    best = int(np.argmin(hist.history["val_loss"])) + 1
    train_w = wape(y[tr], predict_qty(model, X[tr], scaler))
    val_w = wape(y[va], predict_qty(model, X[va], scaler))
    naive_w = wape(y[va], np.array([base[(base.Platform == p) & (base.Date < d)].Sales_Qty.iloc[-7]
                                    for d, p in zip(tgt_dates[va], plats[va])]))
    print(f"\n[1] 기본 학습 : {len(hist.history['loss'])} epoch 중 최적 {best} epoch ({time.time() - t0:.0f}초)")
    print(f"    학습 WAPE {train_w:.1%} / 검증 WAPE {val_w:.1%} (차이 {val_w - train_w:+.1%}p)")
    print(f"    비교 기준 - 7일 전 값 그대로(계절 naive) 검증 WAPE {naive_w:.1%}")
    va_pred = predict_qty(model, X[va], scaler)
    rolling = []
    for p in PLATFORMS:
        m = plats[va] == p
        print(f"    검증 WAPE {p:8s} {wape(y[va][m], va_pred[m]):.1%}")
        rolling += [wape(y[va][m][i : i + WINDOW], va_pred[m][i : i + WINDOW])
                    for i in range(m.sum() - WINDOW + 1)]
    rolling = np.array(rolling)
    print(f"    정상 구간 21일 WAPE 분포 (임계값 근거, {len(rolling)}개 구간) : "
          f"중앙값 {np.median(rolling):.1%} / 95% {np.percentile(rolling, 95):.1%} / 최대 {rolling.max():.1%}")

    # 2) 시나리오 배치 판정
    print("\n[2] 시나리오 배치 판정 (플랫폼별 최근 21건 WAPE, 임계값 20%)")
    for name in ["sales_normal.csv", "sales_drift_brandi.csv", "sales_drift_viral.csv"]:
        res = judge_batch(model, scaler, os.path.join(DATA_DIR, name))
        verdict = " ".join(f"{p} {w:.1%}{'(드리프트)' if w > DRIFT_THRESHOLD else ''}" for p, w in res.items())
        print(f"    {name:28s} {verdict}")

    # 3) 브랜디 : 빠른 배송 피처로 변화를 미리 반영하는지 (피처를 0으로 지운 예측과 비교)
    drift = pd.read_csv(os.path.join(DATA_DIR, "sales_drift_brandi.csv"))
    Xd, yd, _, pd_ = sequences(drift, scaler, last_n_rows=SEQ_LEN + WINDOW)
    m = pd_ == "brandi"
    with_flag = predict_qty(model, Xd[m], scaler)
    no_flag_X = Xd[m].copy()
    no_flag_X[:, :, 2:4] = 0
    without_flag = predict_qty(model, no_flag_X, scaler)
    print(f"\n[3] 브랜디 입점 21일 : 실제 평균 {yd[m].mean():.1f}개, 예측 평균 {with_flag.mean():.1f}개 "
          f"(빠른 배송 피처를 지우면 {without_flag.mean():.1f}개 → 모델이 미리 반영한 효과 ×{with_flag.mean() / without_flag.mean():.2f})")

    # 4) 재학습 효과 : 같은 시나리오의 다음 21일에서 기존 모델 vs 재학습 모델
    nxt = pd.read_csv(os.path.join(DATA_DIR, "sales_drift_brandi_next.csv"))
    Xn, yn, _, pn = sequences(nxt, scaler, last_n_rows=SEQ_LEN + WINDOW)
    mn = pn == "brandi"
    old_pred = predict_qty(model, Xn[mn], scaler)
    old_short, old_over = stock_impact(yn[mn], old_pred)
    print(f"\n[4] 재학습 (최근 41행, warm start) → 다음 21일 브랜디로 확인")
    print(f"    재학습 전 모델 : WAPE {wape(yn[mn], old_pred):.1%}, 품절 {old_short}개, 과잉 입고 {old_over}개")
    for epochs, lr in [(10, 1e-4), (30, 1e-3)]:
        new, old_g, new_g, promoted, n_test = fine_tune(model, scaler, os.path.join(DATA_DIR, "sales_drift_brandi.csv"), epochs, lr)
        new_pred = predict_qty(new, Xn[mn], scaler)
        short, over = stock_impact(yn[mn], new_pred)
        print(f"    {epochs:2d} epoch, lr {lr:g} : 게이트 WAPE {old_g:.1%} → {new_g:.1%} (검증 {n_test}건) "
              f"{'승격' if promoted else '미승격'} | 다음 21일 WAPE {wape(yn[mn], new_pred):.1%}, 품절 {short}개, 과잉 입고 {over}개")

    viral = fine_tune(model, scaler, os.path.join(DATA_DIR, "sales_drift_viral.csv"), 30, 1e-3)
    print(f"    (보조) 바이럴 30 epoch : 게이트 WAPE {viral[1]:.1%} → {viral[2]:.1%} {'승격' if viral[3] else '미승격 → 기존 모델 유지'}")

    print(f"\n총 소요 시간 {time.time() - t0:.0f}초")


if __name__ == "__main__":
    main()
