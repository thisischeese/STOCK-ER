"""
Day1 -> Day2(MLflow 연동) 확장 파일.

Day1 실습 목표: Lazy Loading vs Eager Loading 두 방식을 직접 구현하고
서버 시작 시간 / 첫 요청 응답 시간을 비교합니다. (44번 슬라이드 결과표 참고)
LSTM은 로컬 pickle 모델보다 로딩 자체가 무거워서, 이 비교가 Day1보다 오히려
더 체감됩니다.

Day2 실습 목표: MODEL_SOURCE=mlflow 로 전환해, 로컬 .keras 파일 대신
MLflow Model Registry의 Production 버전을 로드하도록 확장합니다.
main.py / train_and_register.py 코드는 그대로 두고 이 파일만 손대면 되도록
설계되어 있습니다 - 이것이 "조립 블록" 구조입니다.

판매량 스케일러(sales_scaler.pkl)는 baseline 학습 구간에 fit한 파일을 재사용합니다
(MODEL_SOURCE와 무관하게 항상 로컬 파일에서 로드) - 정규화 기준이 바뀌면
이미 그 기준으로 학습된 가중치와 어긋나기 때문입니다.

환경변수
    LOADING_MODE = lazy(기본값) | eager
    MODEL_SOURCE = local(기본값, Day1) | mlflow(Day2+)
    MLFLOW_TRACKING_URI = MODEL_SOURCE=mlflow 일 때 필요
"""
import os
import time

import pandas as pd

from data.features import (
    N_FEATURES, SEQ_LEN, SalesScaler, feature_matrix,
)

LOCAL_MODEL_PATH = "serving_app/models/sales_v1.keras"
SCALER_PATH = "serving_app/models/sales_scaler.pkl"
MLFLOW_MODEL_URI = "models:/Sales_Predictor/Production"

_model_cache = None  # Lazy Loading 캐시


def validate_sales_model(keras_model):
    """학습과 서빙이 같은 20일 x 11피처 모델 입력을 사용하도록 확인한다."""
    if getattr(keras_model, "input_shape", None) != (None, SEQ_LEN, N_FEATURES):
        raise ValueError(
            f"판매량 모델 입력은 (None, {SEQ_LEN}, {N_FEATURES})이어야 합니다."
        )


class LoadedModel:
    """local .keras와 mlflow 두 소스를 동일한 인터페이스로 감싸는 래퍼."""

    def __init__(self, keras_model, scaler: SalesScaler, version: str):
        validate_sales_model(keras_model)
        self._keras_model = keras_model
        self.scaler = scaler
        self.version = version

    def predict_one(self, sequence: list[dict]) -> float:
        """한 플랫폼의 날짜순 판매량 20행으로 다음 날 판매 수량을 예측한다."""
        frame = pd.DataFrame(sequence)
        x = feature_matrix(frame, self.scaler)[None, ...]
        if x.shape != (1, SEQ_LEN, N_FEATURES):
            raise ValueError(f"예측 입력은 ({SEQ_LEN}, {N_FEATURES})이어야 합니다.")
        pred_scaled = float(self._keras_model.predict(x, verbose=0)[0][0])
        return float(self.scaler.inverse_sales(pred_scaled))


def _load_from_local() -> LoadedModel:
    from tensorflow import keras

    scaler = SalesScaler.load(SCALER_PATH)
    keras_model = keras.models.load_model(LOCAL_MODEL_PATH)
    return LoadedModel(keras_model=keras_model, scaler=scaler, version="v1-local")


def _load_from_mlflow() -> LoadedModel:
    """
    TODO(Day2, 핵심 실습): mlflow.tensorflow.load_model(MLFLOW_MODEL_URI) 로
    Production 모델을 로드하도록 완성하세요.
    힌트: train_and_register.py 에서 이미 "HAIC_Predictor" 이름으로 등록·승격까지 해두었습니다.

    # import mlflow.tensorflow
    # keras_model = mlflow.tensorflow.load_model(MLFLOW_MODEL_URI)
    # scaler = HAICScaler.load(SCALER_PATH)  # 스케일러는 MLflow가 아니라 항상 로컬 파일에서
    # return LoadedModel(keras_model=keras_model, scaler=scaler, version="production")
    """
    import mlflow.tensorflow
    from mlflow.tracking import MlflowClient

    model_uri, stage = MLFLOW_MODEL_URI.rsplit("/", 1)
    model_name = model_uri.removeprefix("models:/")
    versions = MlflowClient().get_latest_versions(model_name, stages=[stage])
    if not versions:
        raise RuntimeError(f"{model_name}에 {stage} 모델이 없습니다.")
    version = str(max(versions, key=lambda v: int(v.version)).version)
    # 조회한 버전을 고정해 실제 로드한 가중치와 응답 버전이 일치하도록 한다.
    scaler = SalesScaler.load(SCALER_PATH)
    keras_model = mlflow.tensorflow.load_model(f"{model_uri}/{version}")
    return LoadedModel(keras_model=keras_model, scaler=scaler, version=version)


def _load_model() -> LoadedModel:
    source = os.getenv("MODEL_SOURCE", "local")
    if source == "mlflow":
        return _load_from_mlflow()
    return _load_from_local()


def load_eager() -> LoadedModel:
    """Eager Loading: 서버 시작 시점에 즉시 모델을 로드한다."""
    start = time.time()
    model = _load_model()
    print(f"[eager] model loaded in {time.time() - start:.3f}s at startup")
    global _model_cache
    _model_cache = model
    return model


def get_model() -> LoadedModel:
    """Lazy Loading: 첫 요청이 들어올 때만 로드하고, 이후에는 캐시를 재사용한다."""
    global _model_cache
    if _model_cache is None:
        start = time.time()
        _model_cache = _load_model()
        print(f"[lazy] model loaded in {time.time() - start:.3f}s on first request")
    return _model_cache
