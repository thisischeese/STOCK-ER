import React, { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Copy, Check, RotateCcw, Play } from 'lucide-react';
import {
  mockPipelineSteps,
  mockSidecarReport,
  mockModelRegistry,
  mockRealtimeLogs,
} from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { ModelRegistryVersion } from '../types';
import {
  getLogContent,
  runBatchTest,
  generateDriftBatchRows,
  checkHealth,
  formatWape,
} from '../services/api';

export const AIOpsPage: React.FC = () => {
  const [isRefreshingPipeline, setIsRefreshingPipeline] = useState(false);
  const [pipelineSuccess, setPipelineSuccess] = useState(false);
  const [realtimeLogs, setRealtimeLogs] = useState<string>(mockRealtimeLogs);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isTriggeringBatch, setIsTriggeringBatch] = useState<boolean>(false);
  const [batchResultToast, setBatchResultToast] = useState<{
    type: 'success' | 'warn' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Dynamic KPI and Model Registry State
  const [activeModelVersion, setActiveModelVersion] = useState<string>('Production-v1');
  const [activeModelDelta, setActiveModelDelta] = useState<string>('초기 로컬 모델 가동 중');
  const [latestWape, setLatestWape] = useState<string>('22.8%');
  const [latestWapeDelta, setLatestWapeDelta] = useState<string>('브랜디 빠른 배송 개시 후 오차 상승');
  const [latestWapeAlert, setLatestWapeAlert] = useState<boolean>(true);
  const [retrainDuration, setRetrainDuration] = useState<string>('대기');
  const [registryVersions, setRegistryVersions] = useState<ModelRegistryVersion[]>(mockModelRegistry);

  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'PROMOTE'>('ALL');
  const [activeStepFilter, setActiveStepFilter] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);
  const [rollbackToast, setRollbackToast] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('rollback') === '1') {
      return 'MLflow 레지스트리: Version 1 (LSTM 32-32-16) 버전 롤백 시뮬레이션이 성공하였습니다. 캐시 핫리로드 지연시간 0.04초, 무중단 서빙 확인.';
    }
    return null;
  });
  const [isRollingBack, setIsRollingBack] = useState(false);

  const fetchLiveLogs = async () => {
    const health = await checkHealth(8077);
    setIsBackendConnected(health.ok);
    if (health.ok) {
      const logRes = await getLogContent('aiops.log', 8077);
      if (logRes.ok && logRes.content.trim().length > 0) {
        setRealtimeLogs(logRes.content.trim());
      }
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scroll') === 'registry') {
      const el = document.getElementById('model-registry-section');
      if (el) el.scrollIntoView({ behavior: 'instant' });
    } else if (params.get('scroll') === 'bottom') {
      window.scrollTo({ top: 580, behavior: 'instant' });
    }

    fetchLiveLogs();
  }, []);

  const handleRefreshPipeline = async () => {
    setIsRefreshingPipeline(true);
    await fetchLiveLogs();
    setIsRefreshingPipeline(false);
    setPipelineSuccess(true);
    setTimeout(() => setPipelineSuccess(false), 3000);
  };

  const handleTriggerDriftAndRetrain = async () => {
    setIsTriggeringBatch(true);
    setBatchResultToast(null);

    const rows = generateDriftBatchRows('brandi');
    const result = await runBatchTest(rows, 8077);

    if (result.ok && result.data) {
      const driftCheck = result.data.drift_check;
      const usedModelVersion = result.data.model_version;
      const isRetrain = driftCheck.status === 'retrain_triggered';
      const training = driftCheck.training;

      // 주의: retrain_triggered만으로 교체 성공을 표시하지 않고 반드시 promoted 확인
      const isPromoted = Boolean(training?.promoted);
      const promotedVersion = training?.version;
      const newWape = training?.wape !== undefined ? formatWape(training.wape) : '-';
      const oldWape = training?.old_wape !== undefined ? formatWape(training.old_wape) : '-';

      // 최신 aiops.log 즉시 동기화
      const logRes = await getLogContent('aiops.log', 8077);
      if (logRes.ok && logRes.content.trim().length > 0) {
        setRealtimeLogs(logRes.content.trim());
      }

      if (isPromoted && promotedVersion) {
        setActiveModelVersion(`Production-v${promotedVersion}`);
        setActiveModelDelta(`신규 Version ${promotedVersion} 승격 완료 (MLflow)`);
        setLatestWape(newWape);
        setLatestWapeDelta(`이전 ${oldWape} 대비 회복 (게이트 통과)`);
        setLatestWapeAlert(false);
        setRetrainDuration((result.latencyMs / 1000).toFixed(1));

        const now = new Date();
        const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const newModelRow: ModelRegistryVersion = {
          version: `Version ${promotedVersion} (신규)`,
          stage: 'Production',
          architecture: 'LSTM (32-32-16) + Dropout 0.1',
          valWape: training?.wape !== undefined ? +(training.wape * 100).toFixed(1) : 6.8,
          registeredAt: dateStr,
          promotedBy: 'AIOps Auto-Gate Pipeline',
          servingPort: 8077,
          isCurrentServing: true,
        };

        setRegistryVersions((prev) => [
          newModelRow,
          ...prev.map((m) => ({ ...m, isCurrentServing: false, stage: 'Archived' as const })),
        ]);

        setBatchResultToast({
          type: 'success',
          message: `드리프트 감지 및 모델 자동 승격 완료: 기존 ${usedModelVersion} -> 신규 ${promotedVersion} 승격 (검증 WAPE ${oldWape} -> ${newWape})`,
          details: `동기 재학습 소요시간: ${result.latencyMs}ms, 품질 게이트 통과(WAPE 기준 및 개선 달성)로 무중단 캐시 갱신 완료`,
        });
      } else if (isRetrain) {
        setLatestWape(newWape);
        setLatestWapeDelta(`이전 ${oldWape} 대비 개선 미달 (게이트 탈락, 기존 모델 유지)`);
        setRetrainDuration((result.latencyMs / 1000).toFixed(1));

        setBatchResultToast({
          type: 'warn',
          message: `드리프트 감지 후 재학습 수행: 품질 게이트 기준 미달로 승격 보류, 기존 ${usedModelVersion} 유지 (재학습 WAPE: ${newWape})`,
          details: `동기 재학습 소요시간: ${result.latencyMs}ms, Champion-Challenger 게이트 탈락 (promoted=false)`,
        });
      } else {
        setBatchResultToast({
          type: 'success',
          message: `배치 시계열 정상 판정: WAPE 임계치 이내 유지, 기존 ${usedModelVersion} 서빙 유지`,
          details: `소요시간: ${result.latencyMs}ms, 대상 플랫폼 정상 운영`,
        });
      }
    } else {
      // 오류 분기: 배치 검증 422 vs 재학습 예외 500
      if (result.status === 422) {
        setBatchResultToast({
          type: 'error',
          message: `배치 입력 검증 실패 (HTTP 422): ${result.error || '필수 필드 또는 최소 41행 요건 불충족'}`,
          details: '요청 바디의 8개 필드 형식 및 날짜 오름차순 정렬 상태를 확인하세요.',
        });
      } else if (result.status === 500) {
        setBatchResultToast({
          type: 'error',
          message: `재학습 처리 중 서버 예외 발생 (HTTP 500): ${result.error || '내부 재학습 파이프라인 에러'}`,
          details: '서버 logs/aiops.log 및 터미널 스택트레이스를 확인하세요.',
        });
      } else {
        // 백엔드 미가동 시 안전한 오프라인 시뮬레이션
        setTimeout(() => {
          setBatchResultToast({
            type: 'success',
            message: '드리프트 감지 및 Warm-start 재학습 시뮬레이션 완료 (오프라인 모드)',
            details: '브랜디 WAPE 22.8% 감지 -> 10 epoch 미세조정 -> WAPE 6.8% 회복 -> 모델 승격',
          });
        }, 700);
      }
    }

    setIsTriggeringBatch(false);
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(realtimeLogs);
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
    const lines = realtimeLogs.split('\n');

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
  }, [logFilter, activeStepFilter, realtimeLogs]);

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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTriggerDriftAndRetrain}
            disabled={isTriggeringBatch}
            className="h-[42px] px-4 bg-white border border-stibee-border hover:bg-stibee-surface text-stibee-ink text-sm font-medium rounded-[4px] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Play size={14} className={isTriggeringBatch ? 'animate-spin' : 'text-stibee-coral'} />
            <span>{isTriggeringBatch ? '재학습 파이프라인 수행 중...' : '배치 드리프트 재학습 트리거 (POST /predict/batch-test)'}</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshPipeline}
            disabled={isRefreshingPipeline}
            className="h-[42px] px-4 bg-stibee-coral hover:bg-stibee-coralHover text-white text-sm font-medium rounded-[4px] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={15} className={isRefreshingPipeline ? 'animate-spin' : ''} />
            <span>파이프라인 상태 새로고침</span>
          </button>
        </div>
      </div>

      {pipelineSuccess && (
        <div className="p-3 bg-stibee-surface border border-stibee-border rounded-[4px] text-xs text-stibee-ink flex items-center justify-between animate-in fade-in duration-150">
          <span>AIOps 운영 데몬 및 최신 aiops.log 상태가 정상적으로 동기화되었습니다.</span>
          <span className="text-stibee-caption font-medium">동기화 완료</span>
        </div>
      )}

      {batchResultToast && (
        <div
          className={`p-3 border rounded-[4px] text-xs flex items-center justify-between animate-in fade-in duration-150 ${
            batchResultToast.type === 'error'
              ? 'bg-[#fff5f5] border-[#fca5a5] text-[#991b1b]'
              : batchResultToast.type === 'warn'
              ? 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]'
              : 'bg-stibee-surface border-stibee-border text-stibee-ink'
          }`}
        >
          <div>
            <span
              className={`font-semibold mr-2 ${
                batchResultToast.type === 'error'
                  ? 'text-[#dc2626]'
                  : batchResultToast.type === 'warn'
                  ? 'text-[#d97706]'
                  : 'text-stibee-coral'
              }`}
            >
              [배치 검증 및 재학습 결과]
            </span>
            <span>{batchResultToast.message}</span>
            {batchResultToast.details && (
              <span className="text-stibee-caption ml-2">({batchResultToast.details})</span>
            )}
          </div>
          <span
            className={`font-medium shrink-0 ml-2 ${
              batchResultToast.type === 'error'
                ? 'text-[#dc2626]'
                : batchResultToast.type === 'warn'
                ? 'text-[#d97706]'
                : 'text-stibee-coral'
            }`}
          >
            {batchResultToast.type === 'error' ? '오류' : batchResultToast.type === 'warn' ? '승격 보류' : '실행 완료'}
          </span>
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
          value={activeModelVersion}
          deltaText={activeModelDelta}
          description="MLflow Model Registry 활성 배포"
        />
        <MetricCard
          label="재학습 후 검증 WAPE"
          value={latestWape}
          isAlert={latestWapeAlert}
          deltaText={latestWapeDelta}
          description="배포 게이트 통과 기준(20.0%) 충족"
        />
        <MetricCard
          label="미세조정 재학습 소요시간"
          value={retrainDuration}
          unit={retrainDuration !== '대기' ? '초' : ''}
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
            LSTM 시계열 예측 모델의 스테이지 관리 및 검증 성능 지표
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
              {registryVersions.map((model) => (
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
              {isBackendConnected ? (
                <span className="text-[11px] font-normal px-2 py-0.5 bg-[#eefbf0] text-[#1b7e32] border border-[#a3e635]/40 rounded-[3px]">
                  FastAPI 연결됨 (8077)
                </span>
              ) : (
                <span className="text-[11px] font-normal px-2 py-0.5 bg-stibee-surface text-stibee-caption border border-stibee-hairline rounded-[3px]">
                  오프라인 시뮬레이션
                </span>
              )}
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
