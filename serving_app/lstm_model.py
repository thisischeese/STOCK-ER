"""
판매량 예측용 운영 LSTM 아키텍처. baseline과 MLflow 학습이 공유한다.

입력은 판매량 공통 전처리의 20일 x 11피처다. 기존 운영 LSTM 층과 MSE는 유지한다.
validate_sales_data.py의 GRU와 MAE 구조를 선택하는 작업은 별도 모델 결정이다.

3년치(~756거래일) 데이터 + SEQ_LEN(20)을 적용하면 학습 시퀀스가 약 590개까지 늘어나,
6개월/1층 구성 대비 파라미터 대비 샘플 비율이 충분히 개선됩니다. 그래서 LSTM 3층
(32 -> 32 -> 16, 앞 두 층은 return_sequences=True로 다음 LSTM에 전체 시퀀스를 넘김) +
Dense 1층 구조를 택했습니다 - 이 정도 크기(파라미터 약 1.6만 개)는 CPU로 50 epoch을
학습해도 수십 초~1분 내외면 끝납니다.
"""
from tensorflow import keras

from data.features import N_FEATURES, SEQ_LEN


def build_model() -> keras.Model:
    model = keras.Sequential(
        [
            keras.layers.Input(shape=(SEQ_LEN, N_FEATURES)),
            keras.layers.LSTM(32, return_sequences=True),
            keras.layers.LSTM(32, return_sequences=True),
            keras.layers.LSTM(16),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(1),
        ]
    )
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=1e-3), loss="mse")
    return model
