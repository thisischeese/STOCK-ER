import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PlatformId, NavigationTab, DailySalesDataPoint } from '../types';
import {
  mockPlatformSummaries,
  mockDailySalesHistory,
  mockChannelSalesHistory,
} from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { DemandLineChart } from '../components/common/DemandLineChart';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  predictSales,
  runBatchTest,
  generatePredictSequence,
  generateNormalBatchRows,
  formatWape,
} from '../services/api';

interface ForecastPageProps {
  onNavigateTab: (tab: NavigationTab) => void;
}

export const ForecastPage: React.FC<ForecastPageProps> = ({ onNavigateTab }) => {
  const [selectedChannel, setSelectedChannel] = useState<PlatformId>('all');
  const [timeframe, setTimeframe] = useState<'14d' | '30d' | '60d'>('14d');
  const [isInferencing, setIsInferencing] = useState(false);
  const [inferenceSuccess, setInferenceSuccess] = useState(false);
  const [inferenceFeedback, setInferenceFeedback] = useState<{
    message: string;
    latencyText: string;
  } | null>(null);
  const [livePredictedQty, setLivePredictedQty] = useState<number | null>(null);
  const [liveChartData, setLiveChartData] = useState<DailySalesDataPoint[] | null>(null);
  const [liveWape, setLiveWape] = useState<string | null>(null);
  const [liveHasDrift, setLiveHasDrift] = useState<boolean | null>(null);
  const [livePlatformMetrics, setLivePlatformMetrics] = useState<Record<string, {
    wape: string;
    drift: boolean;
    rmse?: number;
  }> | null>(null);
  const [liveModelVersion, setLiveModelVersion] = useState<string | null>(null);
  const [isLiveFromBackend, setIsLiveFromBackend] = useState<boolean>(false);

  const activeSummary = mockPlatformSummaries[selectedChannel];

  const currentChannelHistory = useMemo(() => {
    const raw = liveChartData || mockChannelSalesHistory[selectedChannel] || mockDailySalesHistory;
    if (timeframe === '14d') {
      return raw.slice(-14);
    }
    if (timeframe === '30d') {
      return raw.slice(-30);
    }
    return raw.slice(-60);
  }, [selectedChannel, timeframe, liveChartData]);

  const isInferenceRunningRef = useRef(false);

  const handleRunInference = async () => {
    if (isInferenceRunningRef.current) return;
    isInferenceRunningRef.current = true;
    setIsInferencing(true);
    setInferenceSuccess(false);

    try {
      const platform = selectedChannel === 'all' ? 'brandi' : selectedChannel;
      const batchRows = generateNormalBatchRows(platform);
      const seq = generatePredictSequence(platform, 42, false, false);

      // 단건 추론과 정상 시계열 배치 평가를 병렬 호출하여 실제 Keras 서빙 모델 결과 수신
      const [predictRes, batchRes] = await Promise.all([
        predictSales(seq, 8077),
        runBatchTest(batchRows, 8077),
      ]);

      if (predictRes.ok && predictRes.data) {
        setLivePredictedQty(Math.round(predictRes.data.predicted_sales_qty));
        setIsLiveFromBackend(true);

        if (batchRes.ok && batchRes.data && batchRes.data.predictions.length > 0) {
          const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
          const transformedPoints: DailySalesDataPoint[] = batchRes.data.predictions.map((p) => {
            const d = new Date(p.date);
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return {
              date: `${month}.${day}`,
              dayOfWeek: dayNames[d.getDay()],
              isWeekend: d.getDay() === 0 || d.getDay() === 6,
              actual: p.actual_sales_qty,
              predicted: Math.round(p.predicted_sales_qty),
              driftOccurred: false,
            };
          });
          setLiveChartData(transformedPoints);

          const platMetric = batchRes.data.drift_check.platforms?.[platform];
          if (platMetric) {
            setLiveWape(formatWape(platMetric.wape));
            setLiveHasDrift(platMetric.drift);
          }

          if (batchRes.data.drift_check.platforms) {
            const metrics: Record<string, { wape: string; drift: boolean; rmse?: number }> = {};
            Object.entries(batchRes.data.drift_check.platforms).forEach(([pKey, pVal]) => {
              metrics[pKey] = {
                wape: formatWape(pVal.wape),
                drift: Boolean(pVal.drift),
                rmse: pVal.rmse,
              };
            });
            setLivePlatformMetrics(metrics);
          }
          if (batchRes.data.model_version) {
            setLiveModelVersion(batchRes.data.model_version);
          }
        }

        setInferenceFeedback({
          message: `FastAPI 서빙 모델(8077)로부터 ${platform} 채널 실시간 추론 시계열을 동기화했습니다. (내일 예측: ${predictRes.data.predicted_sales_qty}개, 버전: ${predictRes.data.model_version})`,
          latencyText: `지연시간: ${predictRes.latencyMs}ms`,
        });
        setInferenceSuccess(true);
        setTimeout(() => setInferenceSuccess(false), 4000);
      } else {
        setIsLiveFromBackend(false);
        setLivePredictedQty(null);
        setLiveChartData(null);
        setLiveWape(null);
        setLiveHasDrift(null);
        setLivePlatformMetrics(null);
        setInferenceFeedback({
          message: '백엔드 서빙 인스턴스(8077) 연결 실패: 서버가 오프라인이거나 응답하지 않아 로컬 기준 데이터를 표시합니다.',
          latencyText: '연결 실패',
        });
        setInferenceSuccess(false);
        setTimeout(() => setInferenceFeedback(null), 5000);
      }
    } catch (err: any) {
      setIsLiveFromBackend(false);
      setLivePredictedQty(null);
      setLiveChartData(null);
      setLiveWape(null);
      setLiveHasDrift(null);
      setLivePlatformMetrics(null);
      setInferenceFeedback({
        message: '추론 처리 중 오류가 발생하여 기본 기준 데이터를 유지합니다.',
        latencyText: '처리 오류',
      });
      setInferenceSuccess(false);
      setTimeout(() => setInferenceFeedback(null), 5000);
    } finally {
      setIsInferencing(false);
      isInferenceRunningRef.current = false;
    }
  };

  useEffect(() => {
    // 화면 마운트 및 채널 변경 시 백엔드 API를 기본 우선 호출하여 실시간 Keras 추론 데이터 반영
    handleRunInference();
  }, [selectedChannel]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stibee-hairline">
        <div>
          <h1 className="text-3xl font-semibold text-stibee-ink tracking-tight">
            수요 예측 및 채널 모니터링
          </h1>
          <p className="text-sm text-stibee-muted mt-1 leading-relaxed">
            동대문 20개 사입 품목의 3대 패션 플랫폼(브랜디, 지그재그, 에이블리) 일일 수요를 실시간 추론합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRunInference}
            disabled={isInferencing}
            className="h-[42px] px-5 bg-stibee-coral hover:bg-stibee-coralHover text-white text-sm font-medium rounded-[4px] transition-colors disabled:opacity-50"
          >
            {isInferencing ? '추론 실행 중...' : '최신 예측 추론 실행'}
          </button>
        </div>
      </div>

      {inferenceFeedback && (
        <div
          className={`p-3 border rounded-[4px] text-xs flex items-center justify-between animate-in fade-in duration-150 ${
            inferenceSuccess
              ? 'bg-stibee-surface border-stibee-border text-stibee-ink'
              : 'bg-[#fff5f5] border-[#fca5a5] text-[#991b1b]'
          }`}
        >
          <span>{inferenceFeedback.message}</span>
          <span className={inferenceSuccess ? 'text-stibee-caption' : 'text-[#dc2626] font-medium'}>
            {inferenceFeedback.latencyText}
          </span>
        </div>
      )}

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="내일 총 예상 주문량"
          value={livePredictedQty !== null ? livePredictedQty : activeSummary.tomorrowPredicted}
          unit="개"
          deltaText={livePredictedQty !== null ? "FastAPI 실시간 추론치 반영" : "전주 대비 +34.2%"}
          description="채널별 가중치 합산 1일 판매량"
        />
        <MetricCard
          label="최근 21일 롤링 WAPE"
          value={liveWape !== null ? liveWape : `${activeSummary.wape21d}%`}
          isAlert={liveHasDrift !== null ? liveHasDrift : activeSummary.hasDrift}
          deltaText={
            liveHasDrift !== null
              ? (liveHasDrift ? '임계치(20.0%) 초과 드리프트 감지' : '정상 범위 유지')
              : (activeSummary.hasDrift ? `이전 ${activeSummary.prevWape}% 대비 급증` : '정상 범위')
          }
          description="예측 오차율 (목표 20.0% 이하)"
        />
        <MetricCard
          label="공유 창고 보유 실재고"
          value={activeSummary.currentStock}
          unit="개"
          description="동대문 20품목 총 보유 재고"
        />
        <MetricCard
          label="데이터 드리프트 감지"
          value={
            liveHasDrift !== null
              ? (liveHasDrift ? '1개 채널 감지' : '0건 (정상)')
              : (activeSummary.hasDrift ? '1개 채널' : '0건')
          }
          isAlert={liveHasDrift !== null ? liveHasDrift : activeSummary.hasDrift}
          deltaText={
            liveHasDrift !== null
              ? (liveHasDrift ? '브랜디 빠른 배송 패턴 변화 감지' : '전 채널 정상 운영')
              : (activeSummary.hasDrift ? '브랜디 빠른 배송 패턴 변화' : '전 채널 정상')
          }
          description="주말 판매 급증으로 인한 영구적 변화"
        />
      </div>

      {/* Main Analysis Section (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols: Interactive Chart Card */}
        <div className="lg:col-span-8 bg-white border border-stibee-hairline rounded-[4px] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-base font-semibold text-stibee-ink flex flex-wrap items-center gap-2">
                <span>{activeSummary.name} 실제 판매량 vs 모델 예측 추이</span>
                {isLiveFromBackend ? (
                  <span className="text-xs font-normal text-[#1b7e32] px-2 py-0.5 bg-[#eefbf0] border border-[#a3e635]/40 rounded-[3px]">
                    FastAPI Keras 실시간 추론 시계열
                  </span>
                ) : (
                  <span className="text-xs font-normal text-stibee-caption px-2 py-0.5 bg-stibee-surface border border-stibee-hairline rounded-[3px]">
                    {activeSummary.deliveryService}
                  </span>
                )}
              </h2>
              <p className="text-xs text-stibee-caption mt-0.5">
                과거 20일 시계열 입력 기반 LSTM (32-32-16) 모델의 익일 판매량 예측 성능 검증
              </p>
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center gap-1 bg-stibee-surface p-1 rounded-[4px] border border-stibee-hairline text-xs">
              <button
                type="button"
                onClick={() => setTimeframe('14d')}
                className={`px-2.5 py-1 rounded-[3px] transition-colors ${
                  timeframe === '14d'
                    ? 'bg-white text-stibee-ink font-medium border border-stibee-hairline'
                    : 'text-stibee-caption hover:text-stibee-ink'
                }`}
              >
                최근 14일
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('30d')}
                className={`px-2.5 py-1 rounded-[3px] transition-colors ${
                  timeframe === '30d'
                    ? 'bg-white text-stibee-ink font-medium border border-stibee-hairline'
                    : 'text-stibee-caption hover:text-stibee-ink'
                }`}
              >
                최근 30일
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('60d')}
                className={`px-2.5 py-1 rounded-[3px] transition-colors ${
                  timeframe === '60d'
                    ? 'bg-white text-stibee-ink font-medium border border-stibee-hairline'
                    : 'text-stibee-caption hover:text-stibee-ink'
                }`}
              >
                최근 60일
              </button>
            </div>
          </div>

          {/* Interactive Chart */}
          <div className="py-2">
            <DemandLineChart data={currentChannelHistory} height={300} />
          </div>
        </div>

        {/* Right 4 Cols: Operational Channel Insights */}
        <div className="lg:col-span-4 space-y-4">
          {/* Drift Alert Card */}
          <div className="bg-white border border-stibee-coral/40 rounded-[4px] p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stibee-coral">
                데이터 드리프트 발생 알림
              </span>
              <span className="text-[11px] text-stibee-caption">
                2026.10.01 발생
              </span>
            </div>
            <h3 className="text-sm font-semibold text-stibee-ink">
              브랜디 빠른 배송 주말 급증 패턴
            </h3>
            <p className="text-xs text-stibee-muted mt-2 leading-relaxed">
              2026년 10월 1일 브랜디 빠른 배송 개시 후 주말 주문이 1.8배로 영구 전환되었습니다. 기존 모델의 오차(WAPE 22.8%)가 임계값 20.0%를 초과하여 자동 재학습 파이프라인이 기동되었습니다.
            </p>
            <div className="mt-4 pt-3 border-t border-stibee-hairline flex items-center justify-between">
              <span className="text-xs text-stibee-caption">
                회복 WAPE: 6.8% (게이트 통과)
              </span>
              <button
                type="button"
                onClick={() => onNavigateTab('aiops')}
                className="text-xs text-stibee-coral hover:text-stibee-coralHover font-medium underline-offset-2 hover:underline"
              >
                AIOps 운영 보기
              </button>
            </div>
          </div>

          {/* Channel Filter Card */}
          <div className="bg-white border border-stibee-hairline rounded-[4px] p-5 space-y-3">
            <div className="text-xs font-semibold text-stibee-ink">
              채널별 수요 및 배송 현황
            </div>
            <div className="space-y-2">
              {(['all', 'brandi', 'zigzag', 'ably'] as const).map((pid) => {
                const item = mockPlatformSummaries[pid];
                const isSelected = selectedChannel === pid;
                const platMetric = pid !== 'all' ? livePlatformMetrics?.[pid] : undefined;
                const displayWape = platMetric ? platMetric.wape : `${item.wape21d}%`;
                const hasDrift = platMetric ? platMetric.drift : item.hasDrift;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => setSelectedChannel(pid)}
                    className={`w-full p-2.5 rounded-[4px] text-left text-xs transition-colors flex items-center justify-between border ${
                      isSelected
                        ? 'bg-stibee-surface border-stibee-border font-medium'
                        : 'bg-white border-stibee-hairline hover:bg-stibee-surface'
                    }`}
                  >
                    <div>
                      <div className="text-stibee-ink font-medium">{item.name}</div>
                      <div className="text-[11px] text-stibee-caption mt-0.5">{item.deliveryService}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-stibee-ink">{item.tomorrowPredicted}개</div>
                      <div className={`text-[11px] ${hasDrift ? 'text-stibee-coral' : 'text-stibee-muted'}`}>
                        WAPE {displayWape}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Table: Detailed Channel Breakdown */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-stibee-ink">
              플랫폼별 예측 지표 및 모델 서빙 상세
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              각 이커머스 입점 채널별 배송 조건과 LSTM (32-32-16) 추론 모델 품질 현황
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('inventory')}
            className="text-xs text-stibee-coral hover:text-stibee-coralHover font-medium"
          >
            사입 재고 계획으로 이동
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stibee-hairline text-stibee-caption">
                <th className="py-3 px-3 font-normal">플랫폼 채널</th>
                <th className="py-3 px-3 font-normal">배송 방식</th>
                <th className="py-3 px-3 font-normal">내일 예상 주문</th>
                <th className="py-3 px-3 font-normal">최근 21일 WAPE</th>
                <th className="py-3 px-3 font-normal">직전 WAPE</th>
                <th className="py-3 px-3 font-normal">서빙 모델 버전</th>
                <th className="py-3 px-3 font-normal">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stibee-hairline">
              {(['brandi', 'zigzag', 'ably'] as const).map((pid) => {
                const item = mockPlatformSummaries[pid];
                const platMetric = livePlatformMetrics?.[pid];
                const displayWape = platMetric ? platMetric.wape : `${item.wape21d.toFixed(1)}%`;
                const hasDrift = platMetric ? platMetric.drift : item.hasDrift;
                const modelVersion = liveModelVersion || item.modelVersion;
                return (
                  <tr key={pid} className="hover:bg-stibee-surface transition-colors">
                    <td className="py-3.5 px-3 font-medium text-stibee-ink">
                      {item.name}
                    </td>
                    <td className="py-3.5 px-3 text-stibee-muted">
                      {item.deliveryService}
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-stibee-ink">
                      {item.tomorrowPredicted}건
                    </td>
                    <td className={`py-3.5 px-3 font-medium ${hasDrift ? 'text-stibee-coral' : 'text-stibee-ink'}`}>
                      {displayWape}
                    </td>
                    <td className="py-3.5 px-3 text-stibee-caption">
                      {item.prevWape.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-3 text-stibee-caption font-mono">
                      {modelVersion}
                    </td>
                    <td className="py-3.5 px-3">
                      <StatusBadge
                        variant={hasDrift ? 'warning' : 'normal'}
                        label={hasDrift ? '드리프트 감지' : '정상 운영 중'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
