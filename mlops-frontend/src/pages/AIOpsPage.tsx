import React, { useState, useMemo } from 'react';
import { RefreshCw, Copy, Check, RotateCcw } from 'lucide-react';
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
  const [activeStepFilter, setActiveStepFilter] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);
  const [rollbackToast, setRollbackToast] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('rollback') === '1') {
      return 'MLflow 레지스트리: Version 1 (GRU 32-16) 버전 롤백 시뮬레이션이 성공하였습니다. 캐시 핫리로드 지연시간 0.04초, 무중단 서빙 확인.';
    }
    return null;
  });
  const [isRollingBack, setIsRollingBack] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scroll') === 'registry') {
      const el = document.getElementById('model-registry-section');
      if (el) el.scrollIntoView({ behavior: 'instant' });
    } else if (params.get('scroll') === 'bottom') {
      window.scrollTo({ top: 580, behavior: 'instant' });
    }
  }, []);

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

  const handleStepClick = (stepNumber: string) => {
    if (activeStepFilter === stepNumber) {
      setActiveStepFilter(null);
    } else {
      setActiveStepFilter(stepNumber);
    }
  };

  const handleRollbackTest = (version: string, architecture: string) => {
    setIsRollingBack(true);
    setTimeout(() => {
      setIsRollingBack(false);
      setRollbackToast(
        `MLflow 레지스트리: ${version} (${architecture}) 버전 롤백 시뮬레이션이 성공하였습니다. 캐시 핫리로드 지연시간 0.04초, 무중단 서빙 확인.`
      );
      setTimeout(() => setRollbackToast(null), 5000);
    }, 800);
  };

  const filteredLogs = useMemo(() => {
    const lines = mockRealtimeLogs.split('\n');

    // If a pipeline step is clicked, prioritize filtering logs related to that step
    if (activeStepFilter !== null) {
      const stepKeywords: Record<string, string[]> = {
        '01': ['[drift]', '[DRIFT', 'WAPE', '윈도우', '초과'],
        '02': ['[retrain]', '[tune]', 'Warm-start', 'epoch', 'AdamW', 'loss'],
        '03': ['[gate]', '[eval]', 'WAPE 6.8%', '게이트', '통과', '기준'],
        '04': ['[promote]', '[serving]', '승격', '캐시', '핫리로드', '8077', '8099'],
      };
      const keywords = stepKeywords[activeStepFilter] || [];
      return lines
        .filter((line) => keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase())))
        .join('\n');
    }

    return lines
      .filter((line) => {
        if (logFilter === 'ALL') return true;
        if (logFilter === 'WARN') return line.includes('[WARN]') || line.includes('[DRIFT');
        if (logFilter === 'PROMOTE') return line.includes('[OK]') || line.includes('promote');
        return line.includes(`[${logFilter}]`);
      })
      .join('\n');
  }, [logFilter, activeStepFilter]);

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

      {rollbackToast && (
        <div className="p-3 bg-stibee-surface border border-stibee-coral/40 rounded-[4px] text-xs text-stibee-ink flex items-center justify-between animate-in fade-in duration-150">
          <span>{rollbackToast}</span>
          <span className="text-stibee-coral font-medium">롤백 완료</span>
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
            대상: {mockSidecarReport.targetChannel} / {mockSidecarReport.wapeRecovery}
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stibee-ink">
              AIOps 자동 대응 파이프라인 수행 단계
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              각 단계를 클릭하면 하단 터미널에서 해당 단계의 실행 로그만 집중 필터링하여 확인할 수 있습니다.
            </p>
          </div>
          {activeStepFilter !== null && (
            <button
              type="button"
              onClick={() => setActiveStepFilter(null)}
              className="text-xs text-stibee-caption hover:text-stibee-ink underline underline-offset-2 flex items-center gap-1 self-start sm:self-auto"
            >
              <RotateCcw size={12} />
              <span>전체 단계 로그 보기</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {mockPipelineSteps.map((step) => {
            const isSelected = activeStepFilter === step.stepNumber;
            return (
              <div
                key={step.stepNumber}
                onClick={() => handleStepClick(step.stepNumber)}
                className={`p-4 bg-white border rounded-[4px] flex flex-col justify-between cursor-pointer transition-all ${
                  isSelected
                    ? 'border-stibee-coral bg-[#fffbfb] ring-1 ring-stibee-coral/30'
                    : 'border-stibee-hairline hover:border-stibee-border'
                }`}
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
            );
          })}
        </div>
      </div>

      {/* Model Registry Version History Table */}
      <div id="model-registry-section" className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-stibee-ink">
            MLflow 모델 레지스트리 버전 이력
          </h2>
          <p className="text-xs text-stibee-caption mt-0.5">
            GRU 시계열 예측 모델의 스테이지 관리 및 검증 성능 지표
          </p>
        </div>

        {rollbackToast && (
          <div className="p-3 bg-[#fff8f8] border border-stibee-coral/40 rounded-[4px] text-xs text-stibee-ink flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="font-semibold text-stibee-coral">[롤백 시뮬레이션 성공]</span>
              <span>{rollbackToast}</span>
            </span>
            <span className="text-stibee-coral font-medium shrink-0 ml-2">무중단 서빙 확인</span>
          </div>
        )}

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
                <th className="py-3 px-3 font-normal text-right">서빙 제어</th>
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
                      <span className="text-xs text-stibee-ink font-medium px-2 py-1 bg-stibee-surface border border-stibee-hairline rounded-[4px]">
                        실시간 서빙 중 (8077/8099)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRollbackTest(model.version, model.architecture)}
                        disabled={isRollingBack}
                        className="px-2.5 py-1 text-xs text-stibee-ink bg-white border border-stibee-border rounded-[4px] hover:bg-stibee-surface transition-colors disabled:opacity-50"
                      >
                        {isRollingBack ? '전환 중...' : '서빙 롤백 테스트'}
                      </button>
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
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-stibee-ink">
                AIOps 파이프라인 실시간 실행 로그 (aiops.log)
              </h2>
              {activeStepFilter !== null && (
                <span className="text-[11px] font-normal px-2 py-0.5 bg-[#fff8f8] text-stibee-coral border border-stibee-coral/30 rounded-[3px]">
                  STEP {activeStepFilter} 필터 적용 중
                </span>
              )}
            </div>
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
                  onClick={() => {
                    setActiveStepFilter(null);
                    setLogFilter(level);
                  }}
                  className={`px-2 py-0.5 rounded-[3px] text-xs transition-colors ${
                    logFilter === level && activeStepFilter === null
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
            {filteredLogs || '(선택한 조건에 일치하는 실행 로그가 없습니다.)'}
          </pre>
        </div>
      </div>
    </div>
  );
};
