"""
모델 구조 비교 실험 러너 : validate_sales_data.py 의 평가 절차를 그대로 쓰되 build_model 만 바꿔
결과 공유 표(검증 WAPE / 학습-검증 차이 / 정상 구간 최대 / 브랜디 드리프트 / 재학습 후 품절 / 시간)를
한 줄 JSON 으로 뽑는다. 비교 결과와 해석은 docs/model-upgrade-gru-dropout.md 참고.

비교 대상 (variant)
    baseline      기존안      LSTM 32-32-16 (스켈레톤 구조)
    gru           1차 변경안  GRU 32 -> GRU 16 (Dropout 없음, 이슈 #1 채택 모델)
    gru_drop      2차 변경안  GRU 32 -> Dropout 0.2 -> GRU 16 (1차 보완)
    gru_drop01x2  참고        GRU 32-16 + 층마다 Dropout 0.1 (현재 main의 validate_sales_data.py)

공정 비교를 위해 변형 하나당 프로세스 하나(시드 고정 상태에서 시작)로 실행한다.
    SEED=42 RETRAIN_GRID="10:1e-4,30:1e-3,20:3e-4" python scripts/run_experiments.py gru_drop
"""
import json
import os
import sys
import time

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from tensorflow import keras

import validate_sales_data as V

# SEED 는 결과 비교용 고정값(42)이지만, 변형 간 차이가 시드 노이즈인지 보려면 바꿔서 여러 번 돌린다.
# (validate_sales_data 가 import 시점에 42 로 고정하므로 그 뒤에 덮어쓴다 - 데이터 구성은 시드와 무관하다.)
SEED = int(os.environ.get("SEED", V.SEED))
keras.utils.set_random_seed(SEED)

# 재학습 epoch·학습률 조합 (README 가 바꿔도 된다고 명시한 항목)
RETRAIN_GRID = [tuple(x.split(":")) for x in
                os.environ.get("RETRAIN_GRID", "10:1e-4,30:1e-3").split(",")]
RETRAIN_GRID = [(int(e), float(lr)) for e, lr in RETRAIN_GRID]


def variant_model(name: str, n_features: int) -> keras.Model:
    L, inp = keras.layers, keras.layers.Input(shape=(V.SEQ_LEN, n_features))
    if name == "baseline":                 # 기존안 : 스켈레톤 구조
        body = [L.LSTM(32, return_sequences=True), L.LSTM(32, return_sequences=True), L.LSTM(16)]
    elif name == "gru":                    # 1차 변경안 : GRU 2층 (Dropout 없음)
        body = [L.GRU(32, return_sequences=True), L.GRU(16)]
    elif name == "gru_drop":               # 2차 변경안 : GRU 2층 + 층 사이 Dropout 0.2
        body = [L.GRU(32, return_sequences=True), L.Dropout(0.2), L.GRU(16)]
    elif name == "gru_drop01x2":           # 참고 : 현재 main 코드 (GRU 2층 + 층마다 Dropout 0.1)
        body = [L.GRU(32, return_sequences=True), L.Dropout(0.1), L.GRU(16), L.Dropout(0.1)]
    else:
        raise SystemExit(f"unknown variant: {name}")

    model = keras.Sequential([inp, *body, L.Dense(16, activation="relu"), L.Dense(1)])
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="mae")
    return model


def run(name: str) -> dict:
    t0 = time.time()
    base = pd.read_csv(os.path.join(V.DATA_DIR, "sales_base.csv"))
    dates = np.sort(base["Date"].unique())
    split_date = dates[int(len(dates) * V.TRAIN_RATIO)]
    scaler = V.Scaler().fit(base[base["Date"] < split_date])

    X, y, tgt_dates, plats = V.sequences(base, scaler)
    tr, va = tgt_dates < split_date, tgt_dates >= split_date
    y_scaled = scaler.scale("Sales_Qty", y)

    model = variant_model(name, X.shape[2])
    early = keras.callbacks.EarlyStopping(monitor="val_loss", patience=15, restore_best_weights=True)
    hist = model.fit(X[tr], y_scaled[tr], validation_data=(X[va], y_scaled[va]),
                     epochs=200, batch_size=32, callbacks=[early], verbose=0)

    train_w = V.wape(y[tr], V.predict_qty(model, X[tr], scaler))
    val_w = V.wape(y[va], V.predict_qty(model, X[va], scaler))
    va_pred = V.predict_qty(model, X[va], scaler)
    rolling = []
    for p in V.PLATFORMS:
        m = plats[va] == p
        rolling += [V.wape(y[va][m][i : i + V.WINDOW], va_pred[m][i : i + V.WINDOW])
                    for i in range(m.sum() - V.WINDOW + 1)]
    rolling = np.array(rolling)

    normal = V.judge_batch(model, scaler, os.path.join(V.DATA_DIR, "sales_normal.csv"))
    drift = V.judge_batch(model, scaler, os.path.join(V.DATA_DIR, "sales_drift_brandi.csv"))
    viral = V.judge_batch(model, scaler, os.path.join(V.DATA_DIR, "sales_drift_viral.csv"))

    nxt = pd.read_csv(os.path.join(V.DATA_DIR, "sales_drift_brandi_next.csv"))
    Xn, yn, _, pn = V.sequences(nxt, scaler, last_n_rows=V.SEQ_LEN + V.WINDOW)
    mn = pn == "brandi"
    old_short, _ = V.stock_impact(yn[mn], V.predict_qty(model, Xn[mn], scaler))

    retrain = {}
    for epochs, lr in RETRAIN_GRID:
        new, old_g, new_g, promoted, _ = V.fine_tune(
            model, scaler, os.path.join(V.DATA_DIR, "sales_drift_brandi.csv"), epochs, lr)
        new_pred = V.predict_qty(new, Xn[mn], scaler)
        short, over = V.stock_impact(yn[mn], new_pred)
        retrain[f"{epochs}ep_lr{lr:g}"] = {
            "gate": [round(old_g, 4), round(new_g, 4)], "promoted": bool(promoted),
            "next_wape": round(V.wape(yn[mn], new_pred), 4), "short": short, "over": over}

    return {
        "variant": name,
        "seed": SEED,
        "params": int(model.count_params()),
        "epochs_run": len(hist.history["loss"]),
        "best_epoch": int(np.argmin(hist.history["val_loss"])) + 1,
        "train_wape": round(train_w, 4),
        "val_wape": round(val_w, 4),
        "gap": round(val_w - train_w, 4),
        "normal_max": round(float(rolling.max()), 4),
        "normal_p95": round(float(np.percentile(rolling, 95)), 4),
        "batch_normal": {k: round(v, 4) for k, v in normal.items()},
        "batch_drift_brandi": {k: round(v, 4) for k, v in drift.items()},
        "batch_drift_viral": {k: round(v, 4) for k, v in viral.items()},
        "short_before": old_short,
        "retrain": retrain,
        "seconds": round(time.time() - t0, 1),
    }


if __name__ == "__main__":
    print("RESULT " + json.dumps(run(sys.argv[1]), ensure_ascii=False))
