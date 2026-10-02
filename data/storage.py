"""판매량 CSV 읽기와 최신 업로드 파일 조회."""
import glob
import os

import pandas as pd

from serving_app.schemas import SALES_ROWS, validate_sales_rows

UPLOAD_DIR = "data/uploads"


def load_sales_data(path_or_buffer, min_rows_per_platform: int = 41) -> pd.DataFrame:
    frame = pd.read_csv(path_or_buffer, encoding="utf-8-sig")
    rows = SALES_ROWS.validate_python(frame.to_dict("records"))
    validate_sales_rows(rows, min_rows_per_platform)
    return pd.DataFrame([row.model_dump(mode="json") for row in rows])


def latest_upload(upload_dir: str | None = None) -> str:
    """업로드된 CSV 중 가장 최근 파일을 반환한다."""
    files = glob.glob(os.path.join(upload_dir or UPLOAD_DIR, "*.csv"))
    if not files:
        raise FileNotFoundError("업로드된 판매량 CSV가 없습니다.")
    return max(files, key=os.path.getmtime)
