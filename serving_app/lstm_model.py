"""
판매량 예측 서빙 모델 구조. baseline 학습(train_baseline_v1.py)과 MLflow 학습(train_and_register.py)이 공유한다.

입력은 판매량 공통 전처리의 20일 x 11피처, 출력은 다음 날 판매 수량(스케일된 값)이다.
구조는 모델 실험(이슈 #1)에서 채택한 기준 모델과 같다 - 근거는 docs/model-upgrade-gru-dropout.md.

    GRU(32) → Dropout(0.2) → GRU(16) → Dense(16, relu) → Dense(1),  loss MAE (평가 지표 WAPE와 맞춤)

- 학습 시퀀스가 약 1,700개라 LSTM 3층(파라미터 17,377개)은 seed에 따라 과적합·오탐이 났다.
  GRU 2층으로 줄여 파라미터가 7,009개다.
- Dropout은 학습 때만 켜진다. 서빙(추론)에서는 꺼져 있어 같은 입력이면 항상 같은 예측이 나온다.
  48건짜리 warm start 재학습이 새 수준을 과하게 따라가 게이트에서 탈락하는 것을 줄여 준다.

파일 이름은 기존 import 경로를 지키기 위해 lstm_model.py 그대로 둔다.
"""
from tensorflow import keras

from data.features import N_FEATURES, SEQ_LEN


def build_model() -> keras.Model:
    model = keras.Sequential(
        [
            keras.layers.Input(shape=(SEQ_LEN, N_FEATURES)),
            keras.layers.GRU(32, return_sequences=True),
            keras.layers.Dropout(0.2),
            keras.layers.GRU(16),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]
    )
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=1e-3), loss="mae")
    return model
