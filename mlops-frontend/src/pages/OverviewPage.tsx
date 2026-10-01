import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PlatformId, TabType } from '../types';
import { mockPlatforms, mockChartData } from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { NoticeBanner } from '../components/common/NoticeBanner';
import { SimpleLineChart } from '../components/common/SimpleLineChart';

interface OverviewPageProps {
  selectedPlatform: PlatformId;
  onNavigateTab: (tab: TabType) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  selectedPlatform,
  onNavigateTab,
}) => {
  const currentMetric = mockPlatforms[selectedPlatform] || mockPlatforms.all;
  const isAll = selectedPlatform === 'all';

  return (
    <div className="space-y-6">
      {/* Dashed Notice Banner */}
      <NoticeBanner />

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="내일 예상 판매량"
          value={currentMetric.expectedSales}
          unit="개"
          description={isAll ? '플랫폼별 예측 합계 (샘플)' : `${currentMetric.name} 내일 예측 (샘플)`}
        />
        <MetricCard
          label="현재 재고"
          value={currentMetric.currentStock}
          unit="개"
          description={isAll ? '선택한 플랫폼 재고 합계 (샘플)' : `${currentMetric.name} 현재 보유 재고 (샘플)`}
        />
        <MetricCard
          label="품질 확인이 필요한 플랫폼"
          value={isAll ? 1 : currentMetric.status === 'warning' ? 1 : 0}
          unit="곳"
          description="최근 21일 WAPE 기준 (샘플)"
          highlight={currentMetric.status === 'warning'}
        />
      </div>

      {/* Middle Section: 2 Columns (Chart + Action Tasks) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sales Flow Chart */}
        <div className="lg:col-span-8 bg-white border border-stibee-hairline rounded-[4px] p-6 hover:border-stibee-border transition-colors">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-stibee-ink">
              판매 흐름을 먼저 확인하세요
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              전체 플랫폼 예시 추이 (선택 필터와 독립된 설명용 그래프)
            </p>
          </div>

          <div className="mt-4">
            <SimpleLineChart data={mockChartData} />
          </div>
        </div>

        {/* Right Column: Today's Action Checklist */}
        <div className="lg:col-span-4 bg-white border border-stibee-hairline rounded-[4px] p-6 flex flex-col justify-between hover:border-stibee-border transition-colors">
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-base font-semibold text-stibee-ink">
                오늘 확인할 일 (전체 플랫폼)
              </h2>
            </div>
            <div className="text-[11px] text-stibee-caption mb-3">
              예시 기준일 2026-10-01
            </div>

            {/* Highlighted Alert Box (Drift Notice) */}
            <div className="p-4 bg-[#fff8f8] border border-stibee-coral/30 rounded-[4px] mb-4">
              <h3 className="text-sm font-semibold text-stibee-ink flex items-center justify-between">
                <span>브랜디의 주말 판매 패턴 변화</span>
              </h3>
              <p className="text-xs text-stibee-muted leading-relaxed mt-2">
                빠른 배송 입점 이후 예측과 실제 판매량의 차이가 커진 예시입니다. 재고 계획 전에 모델 상태를 확인하세요.
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('operations')}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-normal text-stibee-coral hover:text-stibee-coralHover transition-colors"
              >
                <span>모델 상태 보기</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* Bottom Secondary Action */}
          <div className="pt-3 border-t border-stibee-hairline">
            <button
              type="button"
              onClick={() => onNavigateTab('inventory')}
              className="w-full py-2.5 px-3 flex items-center justify-between text-xs text-stibee-ink hover:bg-stibee-surface rounded-[4px] border border-stibee-hairline transition-colors"
            >
              <span>사입 계획 확인</span>
              <ArrowRight size={13} className="text-stibee-caption" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Platform Overview Table */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 hover:border-stibee-border transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-stibee-ink">
            플랫폼별 한눈에 보기
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('sales')}
            className="inline-flex items-center gap-1 text-xs text-stibee-caption hover:text-stibee-coral transition-colors"
          >
            <span>판매 예측 자세히</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stibee-hairline text-stibee-caption">
                <th className="py-2.5 px-3 font-normal">플랫폼</th>
                <th className="py-2.5 px-3 font-normal">내일 예상 판매</th>
                <th className="py-2.5 px-3 font-normal">현재 재고</th>
                <th className="py-2.5 px-3 font-normal">최근 21일 WAPE</th>
                <th className="py-2.5 px-3 font-normal">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stibee-hairline">
              {(['brandi', 'zigzag', 'ably'] as const).map((pid) => {
                const item = mockPlatforms[pid];
                const isSelected = selectedPlatform === pid;

                return (
                  <tr
                    key={pid}
                    className={`hover:bg-stibee-surface transition-colors ${
                      isSelected ? 'bg-stibee-surface font-medium' : ''
                    }`}
                  >
                    <td className="py-3 px-3 text-stibee-ink">
                      {item.name}
                    </td>
                    <td className="py-3 px-3 text-stibee-ink">
                      {item.expectedSales}개
                    </td>
                    <td className="py-3 px-3 text-stibee-ink">
                      {item.currentStock}개
                    </td>
                    <td className="py-3 px-3 text-stibee-ink">
                      {item.wape.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={item.status} label={item.statusText} />
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
