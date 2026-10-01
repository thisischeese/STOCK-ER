import React, { useState } from 'react';
import { RefreshCw, Terminal, CheckCircle2 } from 'lucide-react';
import { mockModelQualityList, mockAIOpsSteps, mockServerLogs } from '../mock/mockData';
import { StatusBadge } from '../components/common/StatusBadge';
import { NoticeBanner } from '../components/common/NoticeBanner';
import { Modal } from '../components/common/Modal';

export const OperationsPage: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [isLogLoaded, setIsLogLoaded] = useState(false);
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);

  const handleRefreshStatus = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 3000);
    }, 800);
  };

  const handleLoadLogs = () => {
    setIsLogLoaded(true);
  };

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <NoticeBanner />

      {/* Top Section: Model Quality Table */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 hover:border-stibee-border transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-stibee-ink">
              모델 품질 확인
            </h2>
            <p className="text-xs text-stibee-caption mt-0.5">
              플랫폼별 최근 21일 (샘플 상태), 서버 상태는 조회 버튼으로 확인합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefreshStatus}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-stibee-ink bg-white border border-stibee-hairline rounded-[4px] hover:border-stibee-border hover:bg-stibee-surface disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={13} className={`${isRefreshing ? 'animate-spin' : ''} text-stibee-caption`} />
            <span>{isRefreshing ? '조회 중...' : '실제 서버 상태 조회'}</span>
          </button>
        </div>

        {refreshSuccess && (
          <div className="mb-4 p-2.5 bg-stibee-surface text-stibee-ink text-xs rounded-[4px] border border-stibee-border animate-in fade-in duration-150 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-stibee-coral" />
            <span>서버 상태가 최신화되었습니다. (FastAPI 서빙 포트: 8077/8099 상태 정상)</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stibee-hairline text-stibee-caption">
                <th className="py-2.5 px-3 font-normal">플랫폼</th>
                <th className="py-2.5 px-3 font-normal">샘플 WAPE</th>
                <th className="py-2.5 px-3 font-normal">판정 기준</th>
                <th className="py-2.5 px-3 font-normal">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stibee-hairline">
              {mockModelQualityList.map((item) => (
                <tr
                  key={item.platform}
                  className="hover:bg-stibee-surface transition-colors"
                >
                  <td className="py-3 px-3 text-stibee-ink font-medium">
                    {item.platform}
                  </td>
                  <td className={`py-3 px-3 font-medium ${item.isDrift ? 'text-stibee-coral' : 'text-stibee-ink'}`}>
                    {item.sampleWape.toFixed(1)}%
                  </td>
                  <td className="py-3 px-3 text-stibee-caption">
                    {item.thresholdText}
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge
                      status={item.isDrift ? 'warning' : 'normal'}
                      label={item.statusText}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Middle Section: Automated Response Pipeline */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 hover:border-stibee-border transition-colors">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-stibee-ink">
            자동 대응 흐름
          </h2>
          <p className="text-xs text-stibee-caption mt-0.5">
            아래는 화면 설명용 단계입니다. 실제 재학습 실행 결과가 아닙니다.
          </p>
        </div>

        {/* 4 Step Workflow Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-4">
          {mockAIOpsSteps.map((stepItem) => (
            <div
              key={stepItem.step}
              className={`p-4 rounded-[4px] border transition-colors ${
                stepItem.isActive
                  ? 'bg-stibee-surface border-stibee-coral ring-1 ring-stibee-coral'
                  : 'bg-white border-stibee-hairline'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-stibee-caption mb-1">
                <span className="font-semibold text-stibee-ink">{stepItem.step} {stepItem.title}</span>
                {stepItem.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#fff8f8] text-stibee-coral border border-stibee-coral/30 rounded-[2px]">
                    감지됨
                  </span>
                )}
              </div>
              <div className="text-xs text-stibee-muted mt-2">
                {stepItem.subtitle}
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-stibee-hairline">
          <button
            type="button"
            onClick={() => setIsScenarioModalOpen(true)}
            className="px-3 py-1.5 text-xs text-stibee-ink bg-white border border-stibee-hairline rounded-[4px] hover:border-stibee-border hover:bg-stibee-surface transition-colors"
          >
            시나리오 설명 보기
          </button>
          <button
            type="button"
            disabled
            className="px-3 py-1.5 text-xs text-stibee-caption bg-stibee-surface border border-stibee-hairline rounded-[4px] cursor-not-allowed"
          >
            실제 재학습 실행 (연결 예정)
          </button>
        </div>
      </div>

      {/* Bottom Section: Server Logs Panel */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 hover:border-stibee-border transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-stibee-caption" />
            <h2 className="text-base font-semibold text-stibee-ink">
              서버 로그
            </h2>
          </div>
          <button
            type="button"
            onClick={handleLoadLogs}
            className="px-3 py-1.5 text-xs text-stibee-ink bg-white border border-stibee-hairline rounded-[4px] hover:border-stibee-border hover:bg-stibee-surface transition-colors"
          >
            실제 로그 조회
          </button>
        </div>

        {/* Log Viewer Screen */}
        <div className="w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs rounded-[4px] p-4 min-h-[140px] max-h-[300px] overflow-y-auto leading-relaxed select-text border border-[#333]">
          {isLogLoaded ? (
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#e0e0e0]">
              {mockServerLogs}
            </pre>
          ) : (
            <div className="h-24 flex items-center justify-center text-neutral-500 font-sans text-xs">
              아직 조회하지 않았습니다. 로그 조회는 읽기 전용입니다.
            </div>
          )}
        </div>
      </div>

      {/* Scenario Explanation Modal */}
      {isScenarioModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsScenarioModalOpen(false)}
          title="AIOps 자동 대응 시나리오 가이드"
          footer={
            <button
              type="button"
              onClick={() => setIsScenarioModalOpen(false)}
              className="px-4 py-2 text-xs bg-stibee-surface border border-stibee-hairline text-stibee-ink rounded-[4px] hover:bg-white"
            >
              확인
            </button>
          }
        >
          <div className="space-y-4 text-xs leading-relaxed text-stibee-ink">
            <div className="p-3 bg-stibee-surface border border-stibee-border rounded-[4px]">
              <strong className="text-stibee-ink font-semibold">주 시나리오: 브랜디 빠른 배송 입점 (영구적 변화)</strong>
              <p className="mt-1 text-stibee-muted">
                2026-10-01 빠른 배송이 시작되어 주말 판매량이 1.8배 급증했습니다. 21일 판정 윈도우에서 WAPE가 22.8%로 임계값(20%)을 초과하여 드리프트 경고가 발생했습니다.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-stibee-ink">자동 파이프라인 처리 과정:</h4>
              <ol className="list-decimal pl-4 space-y-1.5 text-stibee-muted">
                <li><strong className="text-stibee-ink">01 변화 감지:</strong> 21일 이동 윈도우 WAPE가 20%를 초과하여 aiops.log에 [WARN] 기록</li>
                <li><strong className="text-stibee-ink">02 재학습:</strong> 최근 41행(변화 전 20일 + 변화 후 21일) 데이터로 warm start fine-tuning (10 epoch)</li>
                <li><strong className="text-stibee-ink">03 품질 검사:</strong> 검증셋 WAPE가 6.8%로 기준(20%)을 통과했는지 게이트 검증</li>
                <li><strong className="text-stibee-ink">04 모델 교체:</strong> 게이트 통과 시 새 Production 버전으로 승격 및 서빙 캐시 무중단 갱신</li>
              </ol>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
