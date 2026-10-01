import React, { useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { mockServingInstances } from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';

export const ServingPage: React.FC = () => {
  const [wapeThreshold, setWapeThreshold] = useState(20.0);
  const [evalWindow, setEvalWindow] = useState(21);
  const [retrainWindow, setRetrainWindow] = useState(41);
  const [safetyBuffer, setSafetyBuffer] = useState(20);
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleHealthCheck = () => {
    setIsHealthChecking(true);
    setTimeout(() => {
      setIsHealthChecking(false);
    }, 500);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
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
          label="평균 서빙 레이턴시"
          value="40"
          unit="ms"
          description="P99 응답 지연시간 65ms 이내"
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
        <div>
          <h2 className="text-base font-semibold text-stibee-ink">
            서빙 인스턴스 상태 및 이중화 구성
          </h2>
          <p className="text-xs text-stibee-caption mt-0.5">
            개발 검증용 로컬 포트와 운영 컨테이너 포트를 독립적으로 분리하여 무중단 서빙을 보장합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {mockServingInstances.map((instance) => (
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
                  <span className="font-medium text-stibee-ink">{instance.latencyMs}ms</span>
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

      {/* AIOps Hyperparameter Configuration Form */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-stibee-ink">
            AIOps 드리프트 탐지 및 사입 파라미터 제어
          </h2>
          <p className="text-xs text-stibee-caption mt-0.5">
            비즈니스 변동성과 과적합 방지를 위한 핵심 운영 정책 수치를 설정합니다.
          </p>
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
