/**
 * FastAPI 백엔드 서빙(8077) 및 컨테이너(8099) 연동 API 클라이언트
 * 
 * 계약:
 * - GET /health : 서빙 프로세스 가동 상태 및 모델 캐시 로드 여부
 * - POST /predict : 20일 시계열 기반 단건 익일 판매량 추론
 * - POST /predict/batch-test : 41일 이상 배치 시계열 평가 및 AIOps 드리프트 탐지, 재학습 트리거
 * - GET /logs/aiops.log : AIOps 파이프라인 실시간 실행 로그
 * - GET /data/status : 업로드된 판매량 데이터 상태
 */

export interface DailyPoint {
  Date: string; // YYYY-MM-DD
  Platform: 'brandi' | 'zigzag' | 'ably';
  Sales_Qty: number;
  Orders: number;
  Fast_Delivery: number; // 0 또는 1
  Fast_Days: number;
  Active_SKU: number;
  Promo: number; // 0 또는 1
}

export interface PredictResponse {
  platform: string;
  prediction_date: string;
  predicted_sales_qty: number;
  model_version: string;
}

export interface BatchPrediction {
  date: string;
  platform: string;
  actual_sales_qty: number;
  predicted_sales_qty: number;
}

export interface PlatformDriftMetric {
  count?: number;
  wape: number;
  rmse?: number;
  drift: boolean;
  threshold?: number;
  actual_mean?: number;
  predicted_mean?: number;
}

export interface RetrainTrainingResult {
  run_id?: string;
  wape: number;
  old_wape?: number;
  rmse?: number;
  platforms?: Record<string, {
    wape: number;
    old_wape?: number;
    rmse?: number;
  }>;
  promoted: boolean;
  version?: string;
}

export interface BatchTestResponse {
  predictions: BatchPrediction[];
  model_version: string;
  drift_check: {
    status: 'ok' | 'retrain_triggered';
    platforms?: Record<string, PlatformDriftMetric>;
    promoted?: boolean;
    rmse?: number;
    training?: RetrainTrainingResult;
    [key: string]: any;
  };
}

export interface UploadDataResponse {
  filename: string;
  rows: number;
  platforms: Record<string, number>;
}

/**
 * WAPE 지표 포맷팅 헬퍼
 * 0.228 -> "22.8%"
 * 100%를 초과하는 수치(예: 1.15 -> "115.0%")도 정확하게 표시합니다.
 */
export function formatWape(wapeValue: number | undefined | null): string {
  if (wapeValue === undefined || wapeValue === null) return '-';
  const pct = wapeValue <= 2.5 ? wapeValue * 100 : wapeValue;
  return `${pct.toFixed(1)}%`;
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  loading_mode: string;
}

export interface LogFileInfo {
  name: string;
  size: number;
}

export interface LogContentResponse {
  name: string;
  content: string;
}

export interface PlatformDataStatus {
  rows: number;
  start_date: string;
  end_date: string;
  min_sales_qty: number;
  max_sales_qty: number;
  days_since_latest: number;
}

export interface DataStatusResponse {
  exists: boolean;
  filename?: string;
  rows?: number;
  start_date?: string;
  end_date?: string;
  as_of_date?: string;
  platforms?: Record<string, PlatformDataStatus>;
}

const DEFAULT_TIMEOUT_MS = 6000;

export async function checkHealth(port: number = 8077): Promise<{
  ok: boolean;
  data: HealthResponse | null;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      return { ok: false, data: null, latencyMs, error: `HTTP ${res.status}` };
    }
    const data: HealthResponse = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return { ok: false, data: null, latencyMs, error: err?.message || '연결 대기' };
  }
}

export async function predictSales(
  sequence: DailyPoint[],
  port: number = 8077
): Promise<{
  ok: boolean;
  data: PredictResponse | null;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const res = await fetch(`http://localhost:${port}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = +(performance.now() - start).toFixed(1);
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, data: null, latencyMs, error: `HTTP ${res.status}: ${errText}` };
    }
    const data: PredictResponse = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: any) {
    const latencyMs = +(performance.now() - start).toFixed(1);
    return { ok: false, data: null, latencyMs, error: err?.message || '연결 대기' };
  }
}

export async function runBatchTest(
  rows: DailyPoint[],
  port: number = 8077
): Promise<{
  ok: boolean;
  data: BatchTestResponse | null;
  status: number;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    // 재학습 미세조정(10 epoch)이 포함될 수 있으므로 45초 타임아웃을 부여합니다.
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    const res = await fetch(`http://localhost:${port}/predict/batch-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = +(performance.now() - start).toFixed(1);
    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (typeof errJson.detail === 'string') {
          errText = errJson.detail;
        } else if (Array.isArray(errJson.detail)) {
          errText = errJson.detail.map((e: any) => `${e.loc?.join('.') || '필드'}: ${e.msg}`).join(', ');
        }
      } catch {
        errText = await res.text();
      }
      return { ok: false, data: null, status: res.status, latencyMs, error: errText };
    }
    const data: BatchTestResponse = await res.json();
    return { ok: true, data, status: res.status, latencyMs };
  } catch (err: any) {
    const latencyMs = +(performance.now() - start).toFixed(1);
    return { ok: false, data: null, status: 0, latencyMs, error: err?.message || '연결 대기' };
  }
}

export async function uploadSalesCsv(
  file: File,
  port: number = 8077
): Promise<{
  ok: boolean;
  data: UploadDataResponse | null;
  status: number;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`http://localhost:${port}/data/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        detail = errJson.detail || detail;
      } catch {
        detail = await res.text();
      }
      return { ok: false, data: null, status: res.status, error: detail };
    }
    const data: UploadDataResponse = await res.json();
    return { ok: true, data, status: res.status };
  } catch (err: any) {
    return { ok: false, data: null, status: 0, error: err?.message || '업로드 실패' };
  }
}

export async function getLogContent(
  filename: string = 'aiops.log',
  port: number = 8077
): Promise<{
  ok: boolean;
  content: string;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const res = await fetch(`http://localhost:${port}/logs/${filename}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { ok: false, content: '', error: `HTTP ${res.status}` };
    }
    const data: LogContentResponse = await res.json();
    return { ok: true, content: data.content };
  } catch (err: any) {
    return { ok: false, content: '', error: err?.message || '연결 대기' };
  }
}

export async function getDataStatus(
  port: number = 8077
): Promise<{
  ok: boolean;
  data: DataStatusResponse | null;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const res = await fetch(`http://localhost:${port}/data/status`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { ok: false, data: null, error: `HTTP ${res.status}` };
    }
    const data: DataStatusResponse = await res.json();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, data: null, error: err?.message || '연결 대기' };
  }
}

/**
 * 단건 예측(20행)을 위한 현실적인 시계열 입력 생성 헬퍼
 */
export function generatePredictSequence(
  platform: 'brandi' | 'zigzag' | 'ably',
  avgSales: number = 35,
  isWeekend: boolean = false,
  promo: boolean = false
): DailyPoint[] {
  const rows: DailyPoint[] = [];
  const baseDate = new Date('2026-09-11');

  for (let i = 0; i < 20; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    const currentIsWeekend = (i === 19) ? isWeekend : (dayOfWeek === 0 || dayOfWeek === 6);

    let sales = avgSales;
    if (currentIsWeekend) {
      sales = Math.round(sales * 1.35);
    }
    if (promo && i >= 15) {
      sales = Math.round(sales * 1.25);
    }
    // 약한 노이즈 부여
    const jitter = ((i * 7) % 5) - 2;
    sales = Math.max(10, sales + jitter);
    const orders = Math.max(5, Math.round(sales * 0.72));

    rows.push({
      Date: dateStr,
      Platform: platform,
      Sales_Qty: sales,
      Orders: Math.min(orders, sales),
      Fast_Delivery: platform === 'brandi' ? 1 : 0,
      Fast_Days: platform === 'brandi' ? 1 : 0,
      Active_SKU: 18,
      Promo: promo && i >= 15 ? 1 : 0,
    });
  }

  return rows;
}

/**
 * AIOps 드리프트 탐지 및 재학습 파이프라인 검증을 위한 45행 시계열 생성 헬퍼
 * 24일간 정상 판매량 유지 후, 최근 21일간 빠른 배송 급증에 따른 WAPE 드리프트 유도
 */
export function generateDriftBatchRows(
  platform: 'brandi' | 'zigzag' | 'ably' = 'brandi'
): DailyPoint[] {
  const rows: DailyPoint[] = [];
  const baseDate = new Date('2026-08-15');

  for (let i = 0; i < 45; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const isDriftPeriod = i >= 24; // 최근 21일 드리프트 구간

    let sales = 42;
    let fastDelivery = 0;
    let fastDays = 0;

    if (isDriftPeriod) {
      // 빠른 배송 개시 및 주말 판매량 급증
      sales = 82 + ((i * 3) % 9);
      fastDelivery = 1;
      fastDays = 1;
    } else {
      sales = 42 + ((i * 5) % 7) - 3;
    }

    const orders = Math.round(sales * 0.7);

    rows.push({
      Date: dateStr,
      Platform: platform,
      Sales_Qty: sales,
      Orders: Math.min(orders, sales),
      Fast_Delivery: fastDelivery,
      Fast_Days: fastDays,
      Active_SKU: 18,
      Promo: 0,
    });
  }

  return rows;
}
