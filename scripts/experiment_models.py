"""
조별 프로젝트: 모델 구조 비교 실험 스크립트.
validate_sales_data.py의 평가 로직을 그대로 사용하면서 다양한 모델 구조를 비교한다.
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
DRIFT_THRESHOLD = 0.20
TRAIN_RATIO = 0.8
SAFETY = 1.1
SEED = 42

keras.utils.set_random_seed(SEED)


class Scaler:
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


def wape(actual, pred) -> float:
    return float(np.abs(actual - pred).sum() / max(actual.sum(), 1e-9))


def predict_qty(model, X, scaler) -> np.ndarray:
    return scaler.inverse_sales(model.predict(X, verbose=0).flatten())


def stock_impact(actual, pred) -> tuple[int, int]:
    stock = np.ceil(pred * SAFETY)
    return int(np.maximum(actual - stock, 0).sum()), int(np.maximum(stock - actual, 0).sum())


def judge_batch(model, scaler, path: str) -> dict:
    df = pd.read_csv(path)
    X, y, _, plats = sequences(df, scaler, last_n_rows=SEQ_LEN + WINDOW)
    pred = predict_qty(model, X, scaler)
    return {p: wape(y[plats == p], pred[plats == p]) for p in PLATFORMS}


def fine_tune(model, scaler, path: str, epochs: int, lr: float):
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


def run_experiment(name: str, model_builder, X_tr, y_scaled_tr, X_va, y_scaled_va, y_tr, y_va, tgt_dates_va, plats_va, scaler):
    keras.utils.set_random_seed(SEED)
    t0 = time.time()
    n_features = X_tr.shape[2]
    model = model_builder(n_features)
    
    early = keras.callbacks.EarlyStopping(monitor="val_loss", patience=15, restore_best_weights=True)
    hist = model.fit(X_tr, y_scaled_tr, validation_data=(X_va, y_scaled_va),
                     epochs=200, batch_size=32, callbacks=[early], verbose=0)
    train_time = time.time() - t0
    
    train_w = wape(y_tr, predict_qty(model, X_tr, scaler))
    val_w = wape(y_va, predict_qty(model, X_va, scaler))
    diff = val_w - train_w
    
    va_pred = predict_qty(model, X_va, scaler)
    rolling = []
    for p in PLATFORMS:
        m = plats_va == p
        rolling += [wape(y_va[m][i : i + WINDOW], va_pred[m][i : i + WINDOW])
                    for i in range(m.sum() - WINDOW + 1)]
    rolling = np.array(rolling)
    max_normal = rolling.max()
    
    # Drift batches
    norm_res = judge_batch(model, scaler, os.path.join(DATA_DIR, "sales_normal.csv"))
    brandi_res = judge_batch(model, scaler, os.path.join(DATA_DIR, "sales_drift_brandi.csv"))
    viral_res = judge_batch(model, scaler, os.path.join(DATA_DIR, "sales_drift_viral.csv"))
    
    brandi_drift_wape = brandi_res["brandi"]
    norm_all_ok = all(v <= DRIFT_THRESHOLD for v in norm_res.values())
    brandi_only_drift = (brandi_res["brandi"] > DRIFT_THRESHOLD and 
                         brandi_res["zigzag"] <= DRIFT_THRESHOLD and 
                         brandi_res["ably"] <= DRIFT_THRESHOLD)
    
    # Retrain evaluation
    nxt = pd.read_csv(os.path.join(DATA_DIR, "sales_drift_brandi_next.csv"))
    Xn, yn, _, pn = sequences(nxt, scaler, last_n_rows=SEQ_LEN + WINDOW)
    mn = pn == "brandi"
    
    new_model, _, _, promoted, _ = fine_tune(model, scaler, os.path.join(DATA_DIR, "sales_drift_brandi.csv"), 10, 1e-4)
    new_pred = predict_qty(new_model, Xn[mn], scaler)
    short_qty, _ = stock_impact(yn[mn], new_pred)
    next_wape = wape(yn[mn], new_pred)
    
    # Viral check
    viral = fine_tune(model, scaler, os.path.join(DATA_DIR, "sales_drift_viral.csv"), 30, 1e-3)
    viral_fallback = (not viral[3]) # should NOT be promoted
    
    total_time = time.time() - t0
    
    passed = (diff <= 0.02 and max_normal < 0.20 and norm_all_ok and brandi_only_drift and promoted and viral_fallback)
    
    return {
        "name": name,
        "train_wape": train_w,
        "val_wape": val_w,
        "diff": diff,
        "max_normal": max_normal,
        "brandi_drift": brandi_drift_wape,
        "retrain_short": short_qty,
        "next_wape": next_wape,
        "promoted": promoted,
        "viral_fallback": viral_fallback,
        "time": total_time,
        "passed": passed
    }


def main():
    base = pd.read_csv(os.path.join(DATA_DIR, "sales_base.csv"))
    dates = np.sort(base["Date"].unique())
    split_date = dates[int(len(dates) * TRAIN_RATIO)]
    scaler = Scaler().fit(base[base["Date"] < split_date])

    X, y, tgt_dates, plats = sequences(base, scaler)
    tr, va = tgt_dates < split_date, tgt_dates >= split_date
    y_scaled = scaler.scale("Sales_Qty", y)
    
    # Define models
    models = {
        "(기준) LSTM 32-32-16 (MAE)": lambda nf: keras.Sequential([
            keras.layers.Input(shape=(SEQ_LEN, nf)),
            keras.layers.LSTM(32, return_sequences=True),
            keras.layers.LSTM(32, return_sequences=True),
            keras.layers.LSTM(16),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]),
        "LSTM 32-16 + Drop 0.1": lambda nf: keras.Sequential([
            keras.layers.Input(shape=(SEQ_LEN, nf)),
            keras.layers.LSTM(32, return_sequences=True),
            keras.layers.Dropout(0.1),
            keras.layers.LSTM(16),
            keras.layers.Dropout(0.1),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]),
        "GRU 32-16 (2층)": lambda nf: keras.Sequential([
            keras.layers.Input(shape=(SEQ_LEN, nf)),
            keras.layers.GRU(32, return_sequences=True),
            keras.layers.GRU(16),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]),
        "GRU 32-16 + Drop 0.1": lambda nf: keras.Sequential([
            keras.layers.Input(shape=(SEQ_LEN, nf)),
            keras.layers.GRU(32, return_sequences=True),
            keras.layers.Dropout(0.1),
            keras.layers.GRU(16),
            keras.layers.Dropout(0.1),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]),
        "Conv1D(16) + LSTM(32)": lambda nf: keras.Sequential([
            keras.layers.Input(shape=(SEQ_LEN, nf)),
            keras.layers.Conv1D(16, kernel_size=3, padding="same", activation="relu"),
            keras.layers.LSTM(32),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]),
        "LSTM 48-24 (2층 경량)": lambda nf: keras.Sequential([
            keras.layers.Input(shape=(SEQ_LEN, nf)),
            keras.layers.LSTM(48, return_sequences=True),
            keras.layers.LSTM(24),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]),
        "BiLSTM 24 + LSTM 16": lambda nf: keras.Sequential([
            keras.layers.Input(shape=(SEQ_LEN, nf)),
            keras.layers.Bidirectional(keras.layers.LSTM(24, return_sequences=True)),
            keras.layers.LSTM(16),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]),
    }

    results = []
    print("=== 모델 구조 실험 시작 (총 %d개 모델) ===" % len(models))
    for name, builder in models.items():
        print("실행 중: %s ..." % name, end="", flush=True)
        def compile_and_build(nf):
            m = builder(nf)
            m.compile(optimizer=keras.optimizers.Adam(1e-3), loss="mae")
            return m
        res = run_experiment(name, compile_and_build, X[tr], y_scaled[tr], X[va], y_scaled[va], y[tr], y[va], tgt_dates[va], plats[va], scaler)
        results.append(res)
        status = "통과" if res["passed"] else "실패"
        print(" 완료 (검증 WAPE: %.1f%%, 품절: %d개, 판정: %s, %.1f초)" % (res["val_wape"]*100, res["retrain_short"], status, res["time"]))

    print("\n" + "=" * 105)
    print("| %-24s | %-9s | %-10s | %-10s | %-10s | %-9s | %-6s | %-4s |" % 
          ("모델 구조", "검증 WAPE", "학습-검증", "정상구간최대", "브랜디드리프트", "재학습후품절", "시간", "통과"))
    print("|" + "-" * 26 + "|" + "-" * 11 + "|" + "-" * 12 + "|" + "-" * 12 + "|" + "-" * 12 + "|" + "-" * 11 + "|" + "-" * 8 + "|" + "-" * 6 + "|")
    
    for r in results:
        print("| %-24s | %8.1f%% | %+9.1f%%p | %10.1f%% | %10.1f%% | %7d개 | %5.1f초 | %-4s |" %
              (r["name"], r["val_wape"]*100, r["diff"]*100, r["max_normal"]*100, r["brandi_drift"]*100, r["retrain_short"], r["time"], "PASS" if r["passed"] else "FAIL"))
    print("=" * 105)


if __name__ == "__main__":
    main()
