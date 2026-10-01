import React, { useState } from 'react';
import { RefreshCw, Copy, Check } from 'lucide-react';
import {
  mockPipelineSteps,
  mockSidecarReport,
  mockModelRegistry,
  mockRealtimeLogs,
} from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';

export const AIOpsPage: React.FC = () => {
  const [isRefreshingPipeline, setIsRefreshingPipeline] = useState(false);
  const [pipelineSuccess, setPipelineSuccess] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'PROMOTE'>('ALL');
  const [copiedLog, setCopiedLog] = useState(false);

  const handleRefreshPipeline = () => {
    setIsRefreshingPipeline(true);
    setTimeout(() => {
      setIsRefreshingPipeline(false);
      setPipelineSuccess(true);
      setTimeout(() => setPipelineSuccess(false), 3000);
    }, 600);
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(mockRealtimeLogs);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const filteredLogs = mockRealtimeLogs
    .split('\n')
    .filter((line) => {
      if (logFilter === 'ALL') return true;
      if (logFilter === 'WARN') return line.includes('[WARN]') || line.includes('[DRIFT');
      if (logFilter === 'PROMOTE') return line.includes('[OK]') || line.includes('promote');
      return line.includes(`[${logFilter}]`);
    })
    .join('\n');

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stibee-hairline">
        <div>
          <h1 className="text-3xl font-semibold text-stibee-ink tracking-tight">
            AIOps 모델 운영 및 파이프라인
          </h1>
          <p className="text-sm text-stibee-muted mt-1 leading-relaxed">
            데이터 드리프트 실시간 감지, Warm-start 재학습, 품질 평가 게이트 및 MLflow 모델 승격을 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefreshPipeline}
            disabled={isRefreshingPipeline}
            className="h-[42px] px-5 bg-stibee-coral hover:bg-stibee-coralHover text-white text-sm font-medium rounded-[4px] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={15} className={isRefreshingPipeline ? 'animate-spin' : ''} />
            <span>파이프라인 상태 새로고침</span>
          </button>
        </div>
      </div>

      {pipelineSuccess && (
        <div className="p-3 bg-stibee-surface border border-stibee-border rounded-[4px] text-xs text-stibee-ink flex items-center justify-between animate-in fade-in duration-150">
          <span>AIOps 운영 데몬 및 사이드카 리포트 상태가 정상적으로 동기화되었습니다.</span>
          <span className="text-stibee-caption font-medium">동기화 완료</span>
        </div>
      )}

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="활성 서빙 모델 버전"
          value="Production-v2"
          deltaText="Version 2 승격 완료"
          description="MLflow Model Registry 활성 배포"
        />
        <MetricCard
          label="재학습 후 검증 WAPE"
          value="6.8%"
          deltaText="이전 22.8% 대비 16.0%p 회복"
          description="배포 게이트 통과 기준(20.0%) 충족"
        />
        <MetricCard
          label="미세조정 재학습 소요시간"
          value="14.8"
          unit="초"
          description="최근 41일 데이터 10 epoch 수행"
        />
        <MetricCard
          label="서빙 무중단 캐시 갱신"
          value="100%"
          deltaText="다운타임 0초"
          description="FastAPI 로컬 및 컨테이너 무중단 서빙"
        />
      </div>

      {/* Sidecar LLM 3-Line Operational Report Card */}
      <div className="bg-white border border-stibee-border rounded-[4px] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stibee-hairline">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stibee-coral uppercase tracking-wider">
              AIOps Sidecar LLM Report
            </span>
            <span className="text-xs text-stibee-caption">
              ({mockSidecarReport.issuedAt} 발행)
            </span>
          </div>
          <span className="text-xs text-stibee-muted">
            대상: {mockSidecarReport.targetChannel} | {mockSidecarReport.wapeRecovery}
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {mockSidecarReport.threeLineSummary.map((line, idx) => (
            <div key={idx} className="flex items-start gap-3 text-xs leading-relaxed text-stibee-ink">
              <span className="w-5 h-5 rounded-[2px] bg-stibee-surface border border-stibee-hairline flex items-center justify-center font-medium text-stibee-caption shrink-0 mt-0.5">
                0{idx + 1}
              </span>
              <p className="font-normal">{line}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4-Step Pipeline Workflow Steps */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-stibee-ink">
            AIOps 자동 대응 파이프라인 수행 단계
          </h2>
          <p className="text-xs text-stibee-caption mt-0.5">
            이동 판정 윈도우 오차 감지부터 모델 승격 및 서빙 캐시 교체까지 자동화된 전주기 흐름
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {mockPipelineSteps.map((step) => (
            <div
              key={step.stepNumber}
              className="p-4 bg-white border border-stibee-hairline rounded-[4px] flex flex-col justify-between hover:border-stibee-border transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-stibee-coral">
                    STEP {step.stepNumber}
                  </span>
                  <StatusBadge variant="normal" label="수행 완료" />
                </div>
                <h3 className="text-sm font-semibold text-stibee-ink">
                  {step.name}
                </h3>
                <p className="text-xs text-stibee-muted mt-2 leading-relaxed">
                  {step.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-stibee-hairline flex items-center justify-between text-[11px]">
                <span className="text-stibee-caption">{step.metricLabel}</span>
                <span className="font-medium text-stibee-ink">{step.metricValue}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Registry Version History Table */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-stibee-ink">
            MLflow 모델 레지스트리 버전 이력
          </h2>
          <p className="text-xs text-stibee-caption mt-0.5">
            GRU 시계열 예측 모델의 스테이지 관리 및 검증 성능 지표
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stibee-hairline text-stibee-caption">
                <th className="py-3 px-3 font-normal">버전</th>
                <th className="py-3 px-3 font-normal">배포 스테이지</th>
                <th className="py-3 px-3 font-normal">모델 아키텍처</th>
                <th className="py-3 px-3 font-normal">검증 WAPE</th>
                <th className="py-3 px-3 font-normal">등록 일시</th>
                <th className="py-3 px-3 font-normal">승격 주체</th>
                <th className="py-3 px-3 font-normal text-right">서빙 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stibee-hairline">
              {mockModelRegistry.map((model) => (
                <tr key={model.version} className="hover:bg-stibee-surface transition-colors">
                  <td className="py-3.5 px-3 font-medium text-stibee-ink">
                    {model.version}
                  </td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-[4px] text-xs font-normal border ${
                        model.stage === 'Production'
                          ? 'bg-[#fff8f8] text-stibee-coral border-stibee-coral/30'
                          : 'bg-stibee-surface text-stibee-caption border-stibee-hairline'
                      }`}
                    >
                      {model.stage}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-stibee-muted font-mono">
                    {model.architecture}
                  </td>
                  <td className="py-3.5 px-3 font-semibold text-stibee-ink">
                    {model.valWape.toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-3 text-stibee-caption">
                    {model.registeredAt}
                  </td>
                  <td className="py-3.5 px-3 text-stibee-muted">
                    {model.promotedBy}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    {model.isCurrentServing ? (
                      <span className="text-xs text-stibee-ink font-medium">
                        실시간 서빙 중 (8077/8099)
                      </span>
                    ) : (
                      <span className="text-xs text-stibee-caption">아카이브 완료</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Realtime Server Logs Terminal Card */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stibee-ink">
              AIOps 파이프라인 실시간 실행 로그 (aiops.log)
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              이동 윈도우 평가, 드리프트 탐지, 미세조정, 승격 및 캐시 갱신 기록
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-stibee-surface p-1 rounded-[4px] border border-stibee-hairline text-xs">
              {(['ALL', 'INFO', 'WARN', 'PROMOTE'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setLogFilter(level)}
                  className={`px-2 py-0.5 rounded-[3px] text-xs transition-colors ${
                    logFilter === level
                      ? 'bg-white text-stibee-ink font-medium border border-stibee-hairline'
                      : 'text-stibee-caption hover:text-stibee-ink'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopyLogs}
              className="h-8 px-3 text-xs bg-white border border-stibee-border text-stibee-ink rounded-[4px] hover:bg-stibee-surface transition-colors flex items-center gap-1.5"
            >
              {copiedLog ? <Check size={13} className="text-stibee-coral" /> : <Copy size={13} />}
              <span>{copiedLog ? '복사됨' : '로그 복사'}</span>
            </button>
          </div>
        </div>

        {/* High-Contrast Minimal Terminal */}
        <div className="w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[11px] rounded-[4px] p-4 min-h-[160px] max-h-[300px] overflow-y-auto leading-relaxed border border-[#333] select-text">
          <pre className="whitespace-pre-wrap">
            {filteredLogs}
          </pre>
        </div>
      </div>
    </div>
  );
};
