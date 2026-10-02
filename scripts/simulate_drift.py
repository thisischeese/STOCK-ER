"""
Day3 드리프트 감지 시뮬레이션 - 판매량 시나리오 CSV를 서빙 서버의 /predict/batch-test로 보낸다.

핵심 프로세스:
    1) 정상 배치 전송   - sales_normal.csv의 플랫폼별 최근 41행 → 모든 플랫폼 WAPE 20% 이하여야 함
    2) 드리프트 배치 전송 - sales_drift_brandi.csv의 플랫폼별 최근 41행 → 브랜디만 WAPE 20% 초과여야 함
    3) 결과 관찰       - [WARN] drift detected → retrain triggered → 게이트 통과 시 Production 승격

41행 = 시퀀스 20행 + 판정 21행. 배치 하나로 플랫폼마다 정확히 21개의 (예측, 실제) 쌍이 쌓여
drift_detector.py가 바로 판정한다.

사전 준비: 서빙 서버가 떠 있어야 합니다. 재학습은 서버에 가장 최근 업로드된 CSV의 최근 41행을 쓰므로,
          드리프트 배치를 보내기 전에 같은 시나리오 파일을 /data/upload로 올려 두세요
          (--upload 를 주면 이 스크립트가 대신 올립니다).

실행 (프로젝트 루트에서)
    python scripts/simulate_drift.py                       # 로컬 uvicorn 서버 (8077, 기본값)
    python scripts/simulate_drift.py --upload              # 드리프트 시나리오 CSV를 먼저 업로드
    python scripts/simulate_drift.py --target container    # 도커 컨테이너 (8099)
    python scripts/simulate_drift.py --target both         # 같은 배치를 두 서버에 보내 결과 비교
    python scripts/simulate_drift.py --drift sales_drift_viral.csv   # 보조 시나리오

    두 서버 동시 기동 예)
      터미널 1: MODEL_SOURCE=mlflow uvicorn serving_app.main:app --host 0.0.0.0 --port 8077
      터미널 2: docker compose -f serving_app/docker-compose.yml up --build
"""
import argparse
import json
import os

import pandas as pd
import requests

DATA_DIR = "data/synthetic"
BATCH_ROWS = 41  # SEQ_LEN(20) + WINDOW_SIZE(21)

TARGETS = {
    "local": "http://localhost:8077",      # 로컬 uvicorn 서버
    "container": "http://localhost:8099",  # 도커 컨테이너
}
TIMEOUT = 600  # 드리프트가 감지되면 같은 요청 안에서 재학습까지 돌기 때문에 넉넉히 둔다.


def load_batch(filename: str) -> list[dict]:
    """시나리오 CSV에서 플랫폼별 최근 41행을 /predict/batch-test 요청 형식으로 꺼낸다."""
    frame = pd.read_csv(os.path.join(DATA_DIR, filename)).sort_values("Date")
    batch = frame.groupby("Platform", sort=False).tail(BATCH_ROWS)
    # to_json을 거쳐 numpy 정수를 파이썬 int로 바꾼다 (API가 strict int를 요구).
    return json.loads(batch.to_json(orient="records"))


def upload(base_url: str, filename: str) -> None:
    with open(os.path.join(DATA_DIR, filename), "rb") as file:
        resp = requests.post(f"{base_url}/data/upload", files={"file": (filename, file, "text/csv")}, timeout=60)
    resp.raise_for_status()
    print(f"[upload] {filename} -> {resp.json()['filename']}")


def send_batch(base_url: str, rows: list[dict], label: str) -> dict:
    resp = requests.post(f"{base_url}/predict/batch-test", json={"rows": rows}, timeout=TIMEOUT)
    if not resp.ok:
        raise RuntimeError(f"{label}: HTTP {resp.status_code} {resp.text[:300]}")
    result = resp.json()
    print(f"[{label}] model_version={result['model_version']} → {summary(result['drift_check'])}")
    for platform, metrics in result["drift_check"].get("platforms", {}).items():
        flag = "  ← 드리프트" if metrics["drift"] else ""
        print(f"    {platform:7s} WAPE {metrics['wape']:6.1%}  RMSE {metrics['rmse']:6.2f}  ({metrics['count']}건){flag}")
    return result


def summary(check: dict) -> str:
    if check.get("status") != "retrain_triggered":
        return check.get("status", "?")
    training = check.get("training", {})
    if training.get("promoted"):
        return f"재학습 → 승격 (v{training.get('version')}, 게이트 WAPE {training.get('wape', 0):.1%})"
    return f"재학습 → 게이트 미통과, 기존 모델 유지 (게이트 WAPE {training.get('wape', 0):.1%})"


def main():
    parser = argparse.ArgumentParser(description="판매량 드리프트 감지 시뮬레이션")
    parser.add_argument("--target", choices=["local", "container", "both"], default="local",
                        help="local=8077, container=8099, both=같은 배치를 두 서버에 보내 비교")
    parser.add_argument("--normal", default="sales_normal.csv", help="정상 시나리오 CSV (data/synthetic/)")
    parser.add_argument("--drift", default="sales_drift_brandi.csv", help="드리프트 시나리오 CSV (data/synthetic/)")
    parser.add_argument("--upload", action="store_true", help="배치 전송 전에 드리프트 시나리오 CSV를 업로드")
    args = parser.parse_args()
    targets = ["local", "container"] if args.target == "both" else [args.target]

    # 배치는 한 번만 만든다: 두 서버에 "똑같은" 입력을 보내야 결과를 공정하게 비교할 수 있다.
    normal_rows, drift_rows = load_batch(args.normal), load_batch(args.drift)

    results = {}
    for name in targets:
        base_url = TARGETS[name]
        print(f"\n=== {name} ({base_url}) ===")
        try:
            if args.upload:
                upload(base_url, args.drift)
            print(f"[1] 정상 배치 전송 ({args.normal})")
            normal = send_batch(base_url, normal_rows, f"{name}/normal")
            print(f"[2] 드리프트 배치 전송 ({args.drift}) - 재학습이 돌면 수십 초 걸립니다")
            drift = send_batch(base_url, drift_rows, f"{name}/drift")
            results[name] = (normal["drift_check"], drift["drift_check"])
        except requests.exceptions.ConnectionError:
            print(f"[skip] {base_url} 에 연결할 수 없습니다. 서버가 떠 있는지(/health) 확인하세요.")
            results[name] = None

    if len(targets) == 2:
        print("\n[비교] 같은 배치 → 서버별 결과")
        for name in targets:
            r = results[name]
            line = "연결 실패" if r is None else f"normal={summary(r[0])} | drift={summary(r[1])}"
            print(f"  {name:<9}: {line}")

    print("\n[3] 결과 확인: " + ", ".join(f"{TARGETS[n]}/logs/aiops.log" for n in targets)
          + " 에서 [WARN] drift detected → [INFO] retrain triggered → [OK] / [GATE FAILED] 순서를 확인하세요.")


if __name__ == "__main__":
    main()
