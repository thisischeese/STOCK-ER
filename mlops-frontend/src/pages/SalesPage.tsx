import React from 'react';
import { PlatformId } from '../types';
import { mockPlatforms, mockChartData } from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { NoticeBanner } from '../components/common/NoticeBanner';
import { SimpleLineChart } from '../components/common/SimpleLineChart';

interface SalesPageProps {
  selectedPlatform: PlatformId;
}

export const SalesPage: React.FC<SalesPageProps> = ({ selectedPlatform }) => {
  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <NoticeBanner />

      {/* Top 3 Platform Forecast Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['brandi', 'zigzag', 'ably'] as const).map((pid) => {
          const item = mockPlatforms[pid];
          const isSelected = selectedPlatform === pid;

          return (
            <div
              key={pid}
              className={`transition-all ${
                isSelected ? 'border-stibee-coral ring-1 ring-stibee-coral rounded-[4px]' : ''
              }`}
            >
              <MetricCard
                label={item.name}
                value={item.expectedSales}
                unit="개"
                description={`내일 판매 예측 (WAPE ${item.wape.toFixed(1)}%, 샘플)`}
                highlight={item.status === 'warning'}
              />
            </div>
          );
        })}
      </div>

      {/* Center Chart Card */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 hover:border-stibee-border transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-stibee-ink">
              실제 판매량과 예측 비교
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              설명용 전체 추이 (실데이터 연결 시 플랫폼별 교체)
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs px-2.5 py-1 bg-stibee-surface text-stibee-caption border border-stibee-hairline rounded-[4px]">
            최근 14일 예시
          </span>
        </div>

        <div className="mt-4">
          <SimpleLineChart data={mockChartData} />
        </div>
      </div>

      {/* Bottom Verification Details Table */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 hover:border-stibee-border transition-colors">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-stibee-ink">
            변화 이후에도 예측이 잘 맞는지
          </h2>
          <p className="text-xs text-stibee-caption mt-1 leading-relaxed">
            판매 수준이 올라간 사실과 모델 품질은 별도로 확인합니다. 플랫폼별 최근 21일 오차를 기준으로 판단합니다.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stibee-hairline text-stibee-caption">
                <th className="py-2.5 px-3 font-normal">플랫폼</th>
                <th className="py-2.5 px-3 font-normal">예측 대상</th>
                <th className="py-2.5 px-3 font-normal">입력</th>
                <th className="py-2.5 px-3 font-normal">다음 확인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stibee-hairline">
              {(['brandi', 'zigzag', 'ably'] as const).map((pid) => {
                const item = mockPlatforms[pid];
                return (
                  <tr
                    key={pid}
                    className="hover:bg-stibee-surface transition-colors"
                  >
                    <td className="py-3 px-3 text-stibee-ink font-medium">
                      {item.name}
                    </td>
                    <td className="py-3 px-3 text-stibee-ink">
                      다음 날 총 판매 수량
                    </td>
                    <td className="py-3 px-3 text-stibee-caption">
                      {item.recentInputDesc}
                    </td>
                    <td className="py-3 px-3 text-stibee-muted">
                      {item.nextAction}
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
