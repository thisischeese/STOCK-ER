"""판매량 CSV와 같은 8개 필드를 사용하는 예측 및 배치 API 계약."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

from data.features import SEQ_LEN


class DailyPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    Date: date
    Platform: Literal["brandi", "zigzag", "ably"]
    Sales_Qty: int = Field(..., ge=0, strict=True)
    Orders: int = Field(..., ge=0, strict=True)
    Fast_Delivery: int = Field(..., ge=0, le=1, strict=True)
    Fast_Days: int = Field(..., ge=0, strict=True)
    Active_SKU: int = Field(..., ge=0, strict=True)
    Promo: int = Field(..., ge=0, le=1, strict=True)

    @model_validator(mode="after")
    def check_orders(self):
        if self.Orders > self.Sales_Qty:
            raise ValueError("Orders는 Sales_Qty보다 클 수 없습니다.")
        return self


def validate_sales_rows(rows: list[DailyPoint], min_rows_per_platform: int):
    keys = [(row.Date, row.Platform) for row in rows]
    if len(set(keys)) != len(keys):
        raise ValueError("(Date, Platform)이 중복된 행이 있습니다.")
    counts = {}
    for row in rows:
        counts[row.Platform] = counts.get(row.Platform, 0) + 1
    if not counts or any(n < min_rows_per_platform for n in counts.values()):
        raise ValueError(f"포함된 플랫폼마다 최소 {min_rows_per_platform}행이 필요합니다.")


SALES_ROWS = TypeAdapter(list[DailyPoint])


class PredictRequest(BaseModel):
    sequence: list[DailyPoint] = Field(..., min_length=SEQ_LEN, max_length=SEQ_LEN)

    @model_validator(mode="after")
    def check_sequence(self):
        validate_sales_rows(self.sequence, SEQ_LEN)
        if len({row.Platform for row in self.sequence}) != 1:
            raise ValueError("예측 입력은 한 플랫폼의 20행이어야 합니다.")
        dates = [row.Date for row in self.sequence]
        if dates != sorted(dates):
            raise ValueError("sequence는 Date 오름차순이어야 합니다.")
        return self


class PredictResponse(BaseModel):
    platform: str
    prediction_date: date
    predicted_sales_qty: float
    model_version: str


class BatchTestRequest(BaseModel):
    rows: list[DailyPoint] = Field(..., min_length=SEQ_LEN + 21)

    @model_validator(mode="after")
    def check_rows(self):
        validate_sales_rows(self.rows, SEQ_LEN + 21)
        return self


class BatchPrediction(BaseModel):
    date: date
    platform: str
    actual_sales_qty: int
    predicted_sales_qty: float


class BatchTestResponse(BaseModel):
    predictions: list[BatchPrediction]
    model_version: str
    drift_check: dict
