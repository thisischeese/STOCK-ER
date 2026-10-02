"""판매량 CSV 업로드와 최신 파일의 플랫폼별 상태 조회."""
from datetime import datetime, timezone
import io
import os
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from data import storage

router = APIRouter(prefix="/data")


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    try:
        frame = storage.load_sales_data(io.BytesIO(await file.read()))
    except (UnicodeDecodeError, ValueError) as error:
        raise HTTPException(400, f"판매량 CSV가 올바르지 않습니다: {error}") from error
    os.makedirs(storage.UPLOAD_DIR, exist_ok=True)
    filename = f"sales_{uuid4().hex}.csv"
    frame.to_csv(os.path.join(storage.UPLOAD_DIR, filename), index=False, mode="x")
    return {"filename": filename, "rows": len(frame),
            "platforms": frame.groupby("Platform").size().to_dict()}


@router.get("/status")
def status():
    try:
        path = storage.latest_upload()
    except FileNotFoundError:
        return {"exists": False}
    try:
        frame = storage.load_sales_data(path)
    except ValueError as error:
        raise HTTPException(400, f"판매량 CSV가 올바르지 않습니다: {error}") from error
    today = datetime.now(timezone.utc).date()
    platforms = {}
    for platform, part in frame.groupby("Platform"):
        start, end = part["Date"].min(), part["Date"].max()
        platforms[platform] = {
            "rows": len(part), "start_date": start, "end_date": end,
            "min_sales_qty": int(part["Sales_Qty"].min()),
            "max_sales_qty": int(part["Sales_Qty"].max()),
            "days_since_latest": (today - datetime.fromisoformat(end).date()).days,
        }
    return {
        "exists": True, "filename": os.path.basename(path), "rows": len(frame),
        "start_date": frame["Date"].min(), "end_date": frame["Date"].max(),
        "as_of_date": today.isoformat(), "platforms": platforms,
    }
