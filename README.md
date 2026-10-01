#### 다음 실습 코드는 학습 목적으로만 사용 바랍니다. 문의 : architect@sk.com, audit@korea.ac.kr 임성열 Ph.D.

# HAIC 모델 서빙 및 AIOps 3일 실습 스켈레톤

> **5조 조별 프로젝트(쇼핑몰 판매량 예측)에서 모델 구조를 실험하려면** 맨 아래
> [5조 : 합성 데이터로 모델 구조 실험하기](#5조--합성-데이터로-모델-구조-실험하기)를 먼저 읽으세요.

가상 종목 **HumanAI Corporation(HAIC)** 의 일별 시세로 다음날 종가를 예측하는
**LSTM** 모델을 Day1(서빙) → Day2(MLOps) → Day3(AIOps) 순서로 하나의 서빙 서버 위에
쌓아 올리는 실습 스켈레톤입니다. 데이터는 미리 생성해두지 않고, 대시보드에서 CSV
파일을 업로드하는 방식으로 공급합니다 - 실전에서 "새 데이터가 들어온다"는 상황을
그대로 흉내 낸 것입니다.

완성된 전체 기능(4탭 대시보드, 운영 지표, 알람 등)을 보고 싶다면 별도로 제공되는
**데모 패키지**(`project_answer_demo/`)를 참고하세요. 이 스켈레톤과 정답지는 실습
난이도를 낮추기 위해 핵심 루프(업로드 → 학습/서빙 → 드리프트 감지 → 재학습)만
남기고 나머지는 들어내 뒀습니다.

## 데이터 - 대시보드에서 업로드

`data/sample_haic_prices.csv`는 실제 **IBM 2007-01-03 ~ 2009-12-31** 시세를 참조해
만든 예시 데이터(756거래일 ≈ 3년, `Date,Close,Volume` 컬럼)입니다. 상승(2007) →
금융위기로 고점 대비 최대 -45% 폭락(2008) → 회복(2009)까지 실제 시장의 세 국면을
모두 포함하고 있어, Day3 드리프트 감지 실습에서 "정상적인 시장 변동성" vs "이상
드리프트"를 구분하는 근거가 뚜렷합니다.

서버를 띄운 뒤 대시보드(`http://localhost:8077/`)의 업로드 카드에서 이 파일을
그대로 올리면 됩니다. 업로드된 CSV는 `data/uploads/`에 타임스탬프 파일명으로
쌓이고, 학습·시뮬레이션 코드는 항상 **가장 최근에 업로드된 파일**을 사용합니다
(`data/storage.py`의 `latest_upload()`). 여러 번 업로드하면 그때마다 최신 파일로
전환되므로, 다른 시세 CSV(같은 컬럼 형식)로 바꿔 실험해볼 수도 있습니다.

## 모델 아키텍처

최근 20거래일(SEQ_LEN)의 (종가, 거래량) 시퀀스를 입력받아 다음날 종가를 예측하는
3층 LSTM입니다.

```
Input (20, 2)  ->  LSTM(32, return_sequences=True)  ->  LSTM(32, return_sequences=True)
               ->  LSTM(16)  ->  Dense(16, relu)  ->  Dense(1)
```

3년치(~756거래일) 데이터 + SEQ_LEN(20)을 적용하면 학습 시퀀스가 약 590개까지 늘어나,
파라미터(약 1.6만 개) 대비 샘플 비율이 충분히 확보됩니다. 그래서 층을 깊게(LSTM 3층)
쌓았습니다 - CPU로 100 epoch을 학습해도 1분 내외면 끝납니다. (아키텍처 정의는
`serving_app/lstm_model.py`, Day1·Day2가 공유합니다.)

재학습 방식도 유의해서 보세요. Day3에서 드리프트가 감지되면 **처음부터 다시 학습하지
않습니다.** 최근 1개월(21거래일)만으로 LSTM을 스크래치로 학습시키기엔 샘플이 너무
적어 불안정하기 때문에, 이미 전체 데이터로 학습된 **Production 가중치에서 이어서
(warm start) 짧게(10 epoch) fine-tuning**합니다. `serving_app/train_and_register.py`의
`train_and_register()`(Day2, 처음부터 학습)와 `fine_tune()`(Day3, 이어서 학습)이 이 구분입니다.

## 디렉토리 구조

```
project/
├── requirements.txt
├── data/
│   ├── sample_haic_prices.csv  # 대시보드에 업로드해볼 예시 데이터 (IBM 참조 3년치)
│   ├── storage.py               # 업로드된 CSV 중 최신 파일을 찾는 latest_upload()
│   ├── uploads/                 # 업로드된 CSV가 쌓이는 곳 (시작 시 비어 있음)
│   └── features.py              # 시퀀스 빌더(SEQ_LEN=20) + HAICScaler (전 Day 공용)
├── scripts/                    # 서빙 앱 밖에서 실행하는 실습/시뮬레이션 도구
│   ├── train_baseline_v1.py    # Day1 사전 준비: MLflow 없이 로컬 baseline LSTM 생성
│   └── simulate_drift.py       # Day3: 정상/드리프트 배치 생성 + 서버로 주입
└── serving_app/
    ├── main.py                     # Day1 - app 생성, 라우터 등록, 로딩 모드 분기
    ├── schemas.py                  # Day1
    ├── lstm_model.py                # Day1·Day2 공유 아키텍처 정의
    ├── model_loader.py             # Day1 → Day2(MLflow 연동)
    ├── train_and_register.py       # Day2 (base 학습) + Day3 (fine-tuning)
    ├── Dockerfile, docker-compose.yml   # Day2 (단일 컨테이너)
    ├── models/
    │   ├── haic_v1.keras           # Day1 로컬 baseline 모델 (train_baseline_v1.py가 생성)
    │   └── scaler.pkl              # Day1~3 공용 정규화 스케일러 (train_baseline_v1.py가 생성)
    ├── routers/
    │   ├── predict.py              # Day1 → Day3(시뮬레이션 엔드포인트 추가)
    │   ├── health.py               # Day1
    │   ├── data.py                 # Day2: CSV 업로드 (완성형)
    │   └── logs.py                 # Day3: logs/aiops.log 파일 조회 (완성형)
    ├── monitoring/                 # Day3
    │   ├── drift_detector.py       # TODO
    │   └── retrain_trigger.py      # TODO
    ├── static/
    │   └── index.html              # 실습용 대시보드 (완성형) - http://localhost:8000/
    └── logs/                       # retrain_trigger.py의 "aiops" 로거가 쓰는 곳 (실행 시 자동 생성)
```

`serving_app/routers/data.py`, `routers/logs.py`, `static/index.html`은 실습
목표가 아니라 업로드·결과 확인을 위한 배관 코드라 처음부터 완성된 형태로
제공됩니다 - 전부 방금 업로드된 파일이나 로그 파일처럼 이미 존재하는 데이터를
읽거나 저장할 뿐, 가짜 데이터를 만들지 않습니다. 재학습 이력을 MLflow Model
Registry API로 따로 조회하는 대신, `retrain_trigger.py`가 남기는 로그 파일을
그대로 보여주는 쪽을 택했습니다 - 학생이 봐야 할 것은 "재학습이 실제로
일어났다는 증거"이지 레지스트리 조회 API 설계가 아니기 때문입니다.

## 실습용 대시보드

`http://localhost:8077/`은 개발자 대시보드입니다.

- **HAIC 데이터 업로드** - `data/sample_haic_prices.csv`(또는 같은 형식의 다른 CSV)를
  올리면 `/data/upload`로 전송되고, 업로드 완료 여부가 그 자리에 바로 표시됩니다.
- **드리프트 시뮬레이션** - 정상/드리프트 배치를 `/predict/batch-test`로 전송합니다.
  `batch_test()`가 TODO인 동안은 응답이 비어 있거나 오류가 납니다.
- **드리프트 감지 기반 재학습 파이프라인** - 감지 → fine-tuning → 재배포 단계를
  시각화합니다. `drift_detector.py`·`retrain_trigger.py`의 TODO를 채우기 전까지는
  단계가 진행되지 않습니다.
- **재학습 로그** - `/logs`로 `logs/aiops.log` 파일 목록을 보여주고, 클릭하면
  `/logs/{파일명}`으로 내용을 그대로 열어 보여줍니다. `[WARN] drift detected` →
  `[INFO] retrain triggered` → `[OK] new_rmse=...`가 순서대로 쌓이는지 직접
  확인하는 용도입니다.

## 실습 시나리오 (Day1 → Day2 → Day3)

**Day1 — HAIC 로컬 baseline LSTM을 FastAPI로 서빙**
Lazy/Eager 로딩 비교, `/predict`·`/health` 동작 확인, `http://localhost:8077/`에서 대시보드로 확인

**Day2 — Day1 서버 + MLflow 학습·레지스트리·컨테이너화**
base 학습(scratch, 100 epoch), RMSE 게이트($4.00) 통과 버전만 Production 승격, Docker로 재현

**Day3 — Day2 서버에 드리프트 감지·자동 재학습 부착**
드리프트 주입 → fine-tuning(warm start, 10 epoch) → 자동 재배포 확인

세 Day의 산출물은 독립적이지 않고 **하나의 `serving_app/`** 위에 순서대로 쌓입니다
(`model_loader.py`가 Day1 로컬 모델 → Day2 MLflow Production 모델로 전환되는 지점이 그 연결고리입니다).
스케일러(`scaler.pkl`)는 Day1에서 한 번 fit한 뒤 Day1~3 내내 그대로 재사용됩니다 -
fine-tuning 시 다시 fit하면 이미 그 스케일로 학습된 기존 가중치와 어긋나기 때문입니다.

## 실행 순서

```bash
pip install -r requirements.txt

# --- Day1 ---
uvicorn serving_app.main:app --host 0.0.0.0 --port 8077 # http://localhost:8077/ 대시보드, /docs 에서 API 확인
# (lazy 모드가 기본이라 업로드된 데이터가 없어도 서버는 정상적으로 뜹니다)

# 대시보드 업로드 카드에서 data/sample_haic_prices.csv 를 업로드한 뒤,
# 별도 터미널에서:
python scripts/train_baseline_v1.py       # 로컬 baseline LSTM + scaler.pkl 생성
# LOADING_MODE=eager uvicorn serving_app.main:app --reload  # Eager 방식과 시작 시간 비교

# --- Day2 ---
python serving_app/train_and_register.py            # 로컬 MLflow(sqlite)에 학습 기록 + 게이트 통과 시 Production 승격
MODEL_SOURCE=mlflow uvicorn serving_app.main:app --host 0.0.0.0 --port 8077 

# --- 컨테이너로 재현 (단일 컨테이너 - MLflow도 서버 없이 컨테이너 안에서 로컬로 동작) ---
docker compose -f serving_app/docker-compose.yml up --build
# (샘플 데이터를 컨테이너 안에 "업로드"해 둔 뒤 베이스라인 -> MLflow 학습/등록까지
#  이미지 빌드 시점에 전부 끝나므로, 로컬에서 미리 실행해둘 필요가 없습니다)

# --- Day3 ---
uvicorn serving_app.main:app --host 0.0.0.0 --port 8077 
python scripts/simulate_drift.py          # 정상 배치 → 드리프트 배치 순서로 주입
```

`/predict`는 단일 값이 아니라 **최근 20거래일치 시퀀스**를 받습니다. 요청 예시:

```json
{
  "sequence": [
    {"close": 160.0, "volume": 1200000},
    {"close": 160.5, "volume": 1180000},
    { "...": "18개 더" }
  ]
}
```

## TODO 체크리스트 (실습생이 채워야 하는 부분)

이 스켈레톤은 배관(라우팅·업로드·MLflow 학습 로직 등)은 완성되어 있고,
**각 Day의 핵심 학습 목표에 해당하는 부분만 TODO로 비워뒀습니다.**

- `serving_app/model_loader.py` → `_load_from_mlflow()`: MLflow Production 모델 로드 (Day2)
- `serving_app/routers/predict.py` → `batch_test()`: 슬라이딩 윈도우 예측 + `recent_predictions` 누적 (Day3)
- `serving_app/monitoring/drift_detector.py` → `compute_rmse()`: RMSE 직접 구현 (Day3)
- `serving_app/monitoring/retrain_trigger.py` → `check_and_trigger()`: fine-tuning 트리거 연결 (Day3, 힌트: 파일 상단 주석 참고)
- `scripts/simulate_drift.py` → `send_batch()`: `/predict/batch-test` 호출 (Day3)

## 완료 기준

- [ ] `/data/upload`로 CSV를 올리면 업로드 완료로 표시되는가 (`/data/status`로도 확인 가능)
- [ ] 정상 데이터로는 RMSE $4 이내, 드리프트 데이터로는 $4 초과가 재현되는가
- [ ] `logs/aiops.log`에 `[WARN] drift detected` → `[INFO] retrain triggered` →
      `[OK] new_rmse=...` 순서로 기록되는가
- [ ] 재배포 후 `/predict` 호출 시 새 Production 버전이 응답하는가

---

## 5조 : 합성 데이터로 모델 구조 실험하기

조별 프로젝트 주제는 **동대문 사입 상품 20개를 브랜디·지그재그·에이블리에 판매하는 쇼핑몰의
플랫폼별 다음 날 판매 수량 예측**입니다. 실제 데이터 없이 업무 규칙으로 만든 합성 데이터를 쓰고,
아래 검증 스크립트 하나로 "학습 → 과적합 점검 → 드리프트 판정 → 재학습 효과"까지 한 번에 확인합니다.
`serving_app/` 코드는 건드리지 않으므로 서빙 실습과 독립적으로 실험할 수 있습니다.

### 1. 빠른 시작

```bash
source .venv/bin/activate                    # Python 3.12, TensorFlow 2.21 (requirements.txt 기준)
python scripts/generate_sales_data.py        # data/synthetic/ 에 CSV 5개 생성 (수 초)
python scripts/validate_sales_data.py        # 학습 + 평가 전체 (CPU 기준 약 20초)
```

모든 명령은 프로젝트 루트에서 실행합니다. `pandas`는 mlflow 설치 시 함께 설치됩니다.

### 2. 데이터 한눈에 보기

| 파일 (`data/synthetic/`) | 내용 | 검증 스크립트에서의 용도 |
|---|---|---|
| `sales_base.csv` | 730일 × 3개 플랫폼 = 2,190행 (2024-10-01 ~ 2026-09-30) | 기본 학습 (앞 80% 학습 / 뒤 20% 검증) |
| `sales_normal.csv` | 기본 이력 + 정상 21일 | 정상 배치 → 드리프트가 **나오면 안 됨** |
| `sales_drift_brandi.csv` | 기본 이력 + 브랜디 빠른 배송 입점 21일 | 주 시나리오 → 브랜디가 **드리프트로 판정돼야 함** |
| `sales_drift_brandi_next.csv` | 위 시나리오 + 다음 21일 | 재학습 전/후 모델 비교 (품절 수량) |
| `sales_drift_viral.csv` | 기본 이력 + 변동 폭이 커진 21일 | 보조 시나리오 → 재학습해도 게이트 미통과 |

컬럼 : `Date, Platform, Sales_Qty, Orders, Fast_Delivery, Fast_Days, Active_SKU, Promo`

생성 규칙(요일 계수, 빠른 배송 효과·입점일, 상품 회전, 행사, 잡음)은
`scripts/generate_sales_data.py` 상단 상수에 모두 모여 있습니다.

### 3. 기준 모델 (이 결과보다 나은지 비교하세요)

입력 **(20일, 11개 피처)** → 출력 **다음 날 해당 플랫폼 판매 수량**. 세 플랫폼을 하나의 모델이 같이 학습합니다.

| # | 피처 | 형태 |
|---|---|---|
| 1 | 판매 수량 | log1p 후 [0, 1] 스케일 (학습 구간에서 한 번만 fit) |
| 2 | 주문 건수 | log1p 후 [0, 1] 스케일 |
| 3 | 빠른 배송 여부 | 0 / 1 |
| 4 | 빠른 배송 경과일 | min(일수, 28) / 28 |
| 5–6 | 요일 | sin, cos |
| 7 | 판매 중 상품 수 | ÷ 20 |
| 8 | 행사 참여 여부 | 0 / 1 |
| 9–11 | 플랫폼 | 원-핫 (브랜디, 지그재그, 에이블리) |

구조는 스켈레톤과 같은 `LSTM(32) → LSTM(32) → LSTM(16) → Dense(16, relu) → Dense(1)`이고,
loss만 MAE로 바꿨습니다(평가 지표 WAPE와 맞추기 위해). 기준 결과(seed 42):

| 항목 | 기준값 |
|---|---|
| 학습 / 검증 WAPE | 8.2% / 9.0% (차이 +0.8%p) |
| 비교 기준 : 7일 전 값 그대로 | 14.7% |
| 정상 구간 21일 WAPE 최대 | 15.3% |
| 정상 / 브랜디 드리프트 배치 (브랜디) | 8.0% / **22.8%** |
| 다음 21일 브랜디 품절 (재학습 전 → 10 epoch 재학습 후) | 320개 → 88개 |
| 총 소요 시간 | 약 20초 |

### 4. 무엇을 바꿔도 되나

| 바꿔도 되는 것 | 위치 (`scripts/validate_sales_data.py`) |
|---|---|
| 층 구성 (LSTM 층 수·유닛 수, GRU, Conv1D, Dropout 등) | `build_model()` |
| loss, 학습률, optimizer | `build_model()`의 `compile` |
| batch size, 최대 epoch, EarlyStopping patience | `main()`의 `model.fit(...)` |
| 재학습 epoch·학습률 조합 | `main()`의 `for epochs, lr in [...]` |
| 피처 추가·삭제 | `feature_matrix()` (아래 "주의" 참고) |

**공정한 비교를 위해 바꾸지 말아야 하는 것**

- `SEED`, `TRAIN_RATIO`, `Scaler`(학습 구간에서 한 번만 fit) - 바꾸면 기준 결과와 비교할 수 없습니다.
- `WINDOW = 21`, `DRIFT_THRESHOLD = 0.20` - 서빙 앱의 판정 규칙과 같아야 합니다.
- `data/synthetic/` 데이터 - 생성 규칙을 바꿔 실험하고 싶다면 **모델 실험과 따로** 하고, 바꾼 상수를 기록하세요.

**주의 : 서빙 앱과 연결되는 값**

- `SEQ_LEN`(20)을 바꾸면 `/predict` 요청의 시퀀스 길이와 41행 판정 배치 구조가 함께 바뀝니다.
- 피처를 바꾸면 업로드 CSV 컬럼과 `/predict` 요청 필드가 바뀝니다.
- 두 경우 모두 결과가 좋더라도 반영 전에 팀과 먼저 상의하세요(노션 ⑤ API 명세에 영향).

### 5. 구조 바꾸는 예시

`build_model()` 안의 `keras.Sequential([...])` 부분만 바꾸면 됩니다. 재학습 단계는
`clone_model`로 같은 구조를 복제하므로 따로 고칠 필요가 없습니다.

```python
# 예 1) 더 작은 모델 + Dropout (데이터가 2천 개 남짓이라 작아도 충분한지 확인)
keras.layers.Input(shape=(SEQ_LEN, n_features)),
keras.layers.LSTM(32),
keras.layers.Dropout(0.2),
keras.layers.Dense(16, activation="relu"),
keras.layers.Dense(1),

# 예 2) GRU로 교체
keras.layers.Input(shape=(SEQ_LEN, n_features)),
keras.layers.GRU(32, return_sequences=True),
keras.layers.GRU(16),
keras.layers.Dense(16, activation="relu"),
keras.layers.Dense(1),
```

`recurrent_dropout`을 쓰면 학습 시간이 약 2배로 늘어납니다(기준 구조에 0.2를 넣었을 때 20초 → 45초).
층·유닛을 크게 늘릴 때는 시간 제한(아래)을 확인하세요.

### 6. 출력 읽는 법과 통과 기준

| 출력 블록 | 확인할 것 | 통과 기준 |
|---|---|---|
| `[1] 기본 학습` | 학습 / 검증 WAPE와 그 차이 | 검증 WAPE가 7일 전 값 기준(14.7%)보다 낮고, **학습-검증 차이 2%p 이하**(과적합 아님) |
| `[1]` 정상 구간 분포 | 정상 21일 WAPE의 최대값 | **20% 미만** (넘으면 정상인데도 드리프트로 오탐) |
| `[2] 시나리오 배치 판정` | 플랫폼별 21건 WAPE | 정상 배치 : 전부 20% 이하 / 브랜디 드리프트 배치 : **브랜디만** 20% 초과 |
| `[3]` | 빠른 배송 피처를 지웠을 때와의 차이 | 참고용 (모델이 변화를 얼마나 미리 반영하는지) |
| `[4] 재학습` | 게이트 승격 여부, 다음 21일 WAPE·품절 | 승격되고, 다음 21일 품절이 재학습 전보다 줄어듦 |
| 마지막 줄 | 총 소요 시간 | **20분 이내** |

검증 WAPE만 낮다고 좋은 모델이 아닙니다. 너무 유연한 모델은 드리프트 구간에서도 입력을
빠르게 따라가 **브랜디 드리프트를 놓칠 수 있습니다**(`[2]`에서 20% 미만이 됨). 정확도와
드리프트 감지 가능성을 함께 보세요.

### 7. 결과 공유 양식

실험할 때마다 아래 한 줄을 노션(또는 팀 채널)에 남겨 주세요.

| 실험자 | 변경 내용 | 검증 WAPE | 학습-검증 차이 | 정상 구간 최대 | 브랜디 드리프트 | 재학습 후 품절 | 시간 |
|---|---|---|---|---|---|---|---|
| (기준) | 스켈레톤 구조 + MAE | 9.0% | +0.8%p | 15.3% | 22.8% | 88개 | 20초 |
| | | | | | | | |
