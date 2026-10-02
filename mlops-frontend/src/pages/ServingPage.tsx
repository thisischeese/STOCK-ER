import React, { useState } from 'react';
import { RefreshCw, Check, Play, RotateCcw, Terminal } from 'lucide-react';
import { mockServingInstances } from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';

export const ServingPage: React.FC = () => {
  // Hyperparameter Settings State
  const [wapeThreshold, setWapeThreshold] = useState(20.0);
  const [evalWindow, setEvalWindow] = useState(21);
  const [retrainWindow, setRetrainWindow] = useState(41);
  const [safetyBuffer, setSafetyBuffer] = useState(20);

  // Healthcheck State
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [instances, setInstances] = useState(mockServingInstances);
  const [lastPingTime, setLastPingTime] = useState('방금 전');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // API Playground State
  const [testChannel, setTestChannel] = useState<'brandi' | 'zigzag' | 'ably'>('brandi');
  const [testPort, setTestPort] = useState<number>(8077);
  const [testAvgSales, setTestAvgSales] = useState<number>(35);
  const [testIsWeekend, setTestIsWeekend] = useState<boolean>(false);
  const [isInferencing, setIsInferencing] = useState<boolean>(false);
  const [inferenceResult, setInferenceResult] = useState<{
    status: number;
    latencyMs: number;
    data: any;
  } | null>(null);

  const handleHealthCheck = () => {
    setIsHealthChecking(true);
    setTimeout(() => {
      // Simulate slight realistic network jitter
      setInstances((prev) =>
        prev.map((inst) => ({
          ...inst,
          latencyMs: inst.port === 8077 ? Math.floor(32 + Math.random() * 8) : Math.floor(38 + Math.random() * 9),
        }))
      );
      const now = new Date();
      setLastPingTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
      setIsHealthChecking(false);
    }, 450);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleResetDefaults = () => {
    setWapeThreshold(20.0);
    setEvalWindow(21);
    setRetrainWindow(41);
    setSafetyBuffer(20);
  };

  const handleRunPlaygroundInference = () => {
    setIsInferencing(true);
    setTimeout(() => {
      const channelBase: Record<string, number> = {
        brandi: testIsWeekend ? 72 : 48,
        zigzag: testIsWeekend ? 44 : 32,
        ably: testIsWeekend ? 36 : 24,
      };

      const baseDemand = channelBase[testChannel] || 35;
      const calculatedDemand = Math.round(baseDemand * (testAvgSales / 30));
      const simulatedLatency = testPort === 8077 ? +(34 + Math.random() * 6).toFixed(1) : +(39 + Math.random() * 8).toFixed(1);

      setInferenceResult({
        status: 200,
        latencyMs: simulatedLatency,
        data: {
          status: 'success',
          endpoint: `http://localhost:${testPort}/predict`,
          platform: testChannel,
          input_parameters: {
            past_20d_mean: testAvgSales,
            is_weekend: testIsWeekend,
            serving_port: testPort,
          },
          prediction: {
            predicted_units: calculatedDemand,
            confidence_interval_95: [Math.round(calculatedDemand * 0.92), Math.round(calculatedDemand * 1.08)],
            model_version: 'Production-v2',
            model_architecture: 'GRU (32-16) + Residual',
          },
          execution_metadata: {
            serving_instance: testPort === 8077 ? 'local_fastapi' : 'docker_container',
            latency_ms: simulatedLatency,
            timestamp: new Date().toISOString(),
          },
        },
      });
      setIsInferencing(false);
    }, 500);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stibee-hairline">
        <div>
          <h1 className="text-3xl font-semibold text-stibee-ink tracking-tight">
            서빙 엔드포인트 및 운영 설정
          </h1>
          <p className="text-sm text-stibee-muted mt-1 leading-relaxed">
            로컬(8077) 및 컨테이너(8099) 서빙 인스턴스 헬스체크와 AIOps 드리프트 탐지 파라미터를 제어합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleHealthCheck}
            disabled={isHealthChecking}
            className="h-[42px] px-5 bg-white border border-stibee-border hover:bg-stibee-surface text-stibee-ink text-sm font-medium rounded-[4px] transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} className={isHealthChecking ? 'animate-spin' : ''} />
            <span>서빙 헬스체크 핑</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-stibee-surface border border-stibee-border rounded-[4px] text-xs text-stibee-ink flex items-center justify-between animate-in fade-in duration-150">
          <span>AIOps 드리프트 판정 임계값 및 서빙 파라미터가 성공적으로 반영되었습니다.</span>
          <span className="text-stibee-coral font-medium">설정 저장 완료</span>
        </div>
      )}

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="로컬 서빙 엔드포인트"
          value="8077"
          unit="Port"
          description="FastAPI 로컬 서빙 (http://localhost:8077)"
        />
        <MetricCard
          label="컨테이너 서빙 엔드포인트"
          value="8099"
          unit="Port"
          description="Docker 컨테이너 서빙 (http://localhost:8099)"
        />
        <MetricCard
          label="서빙 평균 레이턴시"
          value={instances[0].latencyMs}
          unit="ms"
          deltaText={`마지막 핑: ${lastPingTime}`}
          description="P99 응답 지연시간 65ms 이내 충족"
        />
        <MetricCard
          label="현재 드리프트 임계치"
          value={`${wapeThreshold.toFixed(1)}%`}
          deltaText={`${evalWindow}일 이동 윈도우`}
          description="초과 시 자동 파이프라인 기동"
        />
      </div>

      {/* Serving Instances Cards */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stibee-ink">
              서빙 인스턴스 상태 및 이중화 구성
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              개발 검증용 로컬 포트와 운영 컨테이너 포트를 독립적으로 분리하여 무중단 서빙을 보장합니다.
            </p>
          </div>
          <span className="text-xs text-stibee-caption">
            실시간 핑 갱신 주기: 수동 트리거 및 요청 시 자동 측정
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {instances.map((instance) => (
            <div
              key={instance.id}
              className="p-5 bg-white border border-stibee-hairline rounded-[4px] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stibee-ink">
                  {instance.name}
                </span>
                <StatusBadge variant="normal" label="정상 가동 중" />
              </div>

              <div className="space-y-1.5 text-xs text-stibee-ink pt-1">
                <div className="flex justify-between py-1 border-b border-stibee-hairline">
                  <span className="text-stibee-caption">접속 URL</span>
                  <span className="font-mono font-medium text-stibee-ink">{instance.endpointUrl}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stibee-hairline">
                  <span className="text-stibee-caption">서빙 포트</span>
                  <span className="font-mono font-medium">{instance.port}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stibee-hairline">
                  <span className="text-stibee-caption">응답 지연시간 (Latency)</span>
                  <span className="font-medium text-stibee-ink font-mono">{instance.latencyMs}ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stibee-hairline">
                  <span className="text-stibee-caption">무중단 가동 시간</span>
                  <span className="text-stibee-muted">{instance.uptime}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-stibee-caption">탑재 모델</span>
                  <span className="font-mono text-stibee-ink">{instance.activeModel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive API Inference Playground Card */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-stibee-coral" />
            <h2 className="text-base font-semibold text-stibee-ink">
              FastAPI 서빙 실시간 추론 테스트 (POST /predict)
            </h2>
          </div>
          <p className="text-xs text-stibee-caption mt-0.5">
            운영 중인 로컬 및 컨테이너 FastAPI 서빙 엔드포인트에 테스트 요청을 전달하고 실제 추론 결과와 응답 지연시간을 검증합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-1">
          {/* Playground Form Controls */}
          <div className="lg:col-span-5 space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="block font-medium text-stibee-ink">
                서빙 엔드포인트 포트
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTestPort(8077)}
                  className={`h-9 px-3 border rounded-[4px] font-mono text-xs transition-colors ${
                    testPort === 8077
                      ? 'border-stibee-coral bg-[#fff8f8] text-stibee-coral font-medium'
                      : 'border-stibee-border bg-white text-stibee-ink hover:bg-stibee-surface'
                  }`}
                >
                  포트 8077 (로컬)
                </button>
                <button
                  type="button"
                  onClick={() => setTestPort(8099)}
                  className={`h-9 px-3 border rounded-[4px] font-mono text-xs transition-colors ${
                    testPort === 8099
                      ? 'border-stibee-coral bg-[#fff8f8] text-stibee-coral font-medium'
                      : 'border-stibee-border bg-white text-stibee-ink hover:bg-stibee-surface'
                  }`}
                >
                  포트 8099 (컨테이너)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block font-medium text-stibee-ink">
                테스트 채널
              </label>
              <select
                value={testChannel}
                onChange={(e) => setTestChannel(e.target.value as any)}
                className="w-full h-9 px-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink focus:outline-none focus:border-stibee-borderFocus"
              >
                <option value="brandi">브랜디 (주말 수요 집중 채널)</option>
                <option value="zigzag">지그재그 (주간 안정 채널)</option>
                <option value="ably">에이블리 (소폭 우상향 채널)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block font-medium text-stibee-ink">
                과거 20일 일평균 판매량 (개)
              </label>
              <input
                type="number"
                min="5"
                max="200"
                value={testAvgSales}
                onChange={(e) => setTestAvgSales(parseInt(e.target.value) || 20)}
                className="w-full h-9 px-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink focus:outline-none focus:border-stibee-borderFocus"
              />
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-stibee-ink">
                <input
                  type="checkbox"
                  checked={testIsWeekend}
                  onChange={(e) => setTestIsWeekend(e.target.checked)}
                  className="rounded-[2px] border-stibee-border accent-stibee-coral"
                />
                <span>예측 대상일 주말 여부 플래그 (is_weekend = 1)</span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleRunPlaygroundInference}
              disabled={isInferencing}
              className="w-full h-10 px-4 bg-stibee-coral hover:bg-stibee-coralHover text-white text-xs font-medium rounded-[4px] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              <Play size={13} className={isInferencing ? 'animate-spin' : ''} />
              <span>{isInferencing ? '추론 요청 처리 중...' : '단건 예측 추론 실행 (POST /predict)'}</span>
            </button>
          </div>

          {/* Playground Response Terminal */}
          <div className="lg:col-span-7 bg-[#1e1e1e] border border-[#333] rounded-[4px] p-4 flex flex-col justify-between font-mono text-[11px] text-[#d4d4d4] min-h-[220px]">
            <div className="flex items-center justify-between pb-2 border-b border-[#333]">
              <span className="text-[#888]">HTTP Response (JSON)</span>
              {inferenceResult && (
                <div className="flex items-center gap-2">
                  <span className="text-stibee-coral font-sans text-xs">
                    {inferenceResult.latencyMs}ms
                  </span>
                  <span className="px-1.5 py-0.5 rounded-[2px] bg-[#2e3b2e] text-[#8ce99a] text-[10px]">
                    200 OK
                  </span>
                </div>
              )}
            </div>

            <div className="py-2 overflow-y-auto max-h-[200px] leading-relaxed select-text">
              {inferenceResult ? (
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(inferenceResult.data, null, 2)}
                </pre>
              ) : (
                <p className="text-[#777] italic py-8 text-center">
                  좌측 설정을 지정한 후 '단건 예측 추론 실행' 버튼을 클릭하면 실시간 JSON 응답이 여기에 출력됩니다.
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-[#333] text-[10px] text-[#888] flex items-center justify-between">
              <span>FastAPI v0.115 / Uvicorn Worker</span>
              <span>Model: Production-v2 (MLflow: 2.16.2)</span>
            </div>
          </div>
        </div>
      </div>

      {/* AIOps Hyperparameter Configuration Form */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stibee-ink">
              AIOps 드리프트 탐지 및 사입 파라미터 제어
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              비즈니스 변동성과 과적합 방지를 위한 핵심 운영 정책 수치를 설정합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-stibee-caption hover:text-stibee-ink flex items-center gap-1 self-start sm:self-auto"
          >
            <RotateCcw size={12} />
            <span>기본값 복원</span>
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-5 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* WAPE Threshold */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stibee-ink">
                WAPE 드리프트 경고 임계값 (%)
              </label>
              <input
                type="number"
                step="0.5"
                min="5"
                max="50"
                value={wapeThreshold}
                onChange={(e) => setWapeThreshold(parseFloat(e.target.value) || 20.0)}
                className="w-full h-10 px-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink focus:outline-none focus:border-stibee-borderFocus"
              />
              <p className="text-[11px] text-stibee-caption">
                이동 판정 윈도우 WAPE가 이 기준을 초과하면 [DRIFT DETECTED]가 발생합니다.
              </p>
            </div>

            {/* Evaluation Window */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stibee-ink">
                이동 판정 윈도우 크기 (일)
              </label>
              <input
                type="number"
                min="7"
                max="60"
                value={evalWindow}
                onChange={(e) => setEvalWindow(parseInt(e.target.value) || 21)}
                className="w-full h-10 px-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink focus:outline-none focus:border-stibee-borderFocus"
              />
              <p className="text-[11px] text-stibee-caption">
                최근 21일 판매 데이터를 누적하여 일시적 노이즈가 아닌 구조적 변화를 판별합니다.
              </p>
            </div>

            {/* Retrain Window */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stibee-ink">
                Warm-start 재학습 데이터 기간 (일)
              </label>
              <input
                type="number"
                min="20"
                max="120"
                value={retrainWindow}
                onChange={(e) => setRetrainWindow(parseInt(e.target.value) || 41)}
                className="w-full h-10 px-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink focus:outline-none focus:border-stibee-borderFocus"
              />
              <p className="text-[11px] text-stibee-caption">
                변화 전 20일과 변화 후 21일 데이터를 결합하여 이전 패턴 망각과 과적합을 방지합니다.
              </p>
            </div>

            {/* Safety Stock Buffer */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-stibee-ink">
                안전재고 버퍼 가산율 (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={safetyBuffer}
                onChange={(e) => setSafetyBuffer(parseInt(e.target.value) || 20)}
                className="w-full h-10 px-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink focus:outline-none focus:border-stibee-borderFocus"
              />
              <p className="text-[11px] text-stibee-caption">
                예상 수요량 대비 동대문 사입 리드타임 지연 및 결품 방지 버퍼 비율입니다.
              </p>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              className="h-[42px] px-6 bg-stibee-coral hover:bg-stibee-coralHover text-white text-sm font-medium rounded-[4px] transition-colors flex items-center gap-2"
            >
              <Check size={15} />
              <span>운영 정책 설정 저장</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
