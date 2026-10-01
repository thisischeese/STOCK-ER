import React from 'react';
import { NavigationTab, TabType } from '../../types';

interface HeaderProps {
  currentTab: NavigationTab | TabType;
  onTabChange?: (tab: any) => void;
  servingHealthy?: boolean;
  onOpenMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  servingHealthy = true,
}) => {
  const tabs: { id: NavigationTab; label: string }[] = [
    { id: 'forecast', label: '수요 예측' },
    { id: 'inventory', label: '사입 재고 계획' },
    { id: 'aiops', label: 'AIOps 운영' },
    { id: 'serving', label: '서빙 설정' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-stibee-hairline">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: Brand Identity & Store Badge */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 cursor-pointer select-none">
            <span className="font-semibold text-xl tracking-tight text-stibee-ink">
              STOCKER
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-stibee-coral -ml-1 mt-0.5" />
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-stibee-hairline text-xs text-stibee-caption">
            <span>러블리마켓 (동대문 사입 20품목)</span>
          </div>
        </div>

        {/* Center: Main Navigation Tabs */}
        <nav className="flex items-center space-x-1 h-full">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={`h-14 px-4 text-sm font-sans flex items-center transition-colors relative ${
                  isActive
                    ? 'text-stibee-ink font-semibold'
                    : 'text-stibee-muted hover:text-stibee-subtle font-normal'
                }`}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-stibee-coral" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Operational Status & Date */}
        <div className="flex items-center gap-4 text-xs">
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-stibee-surface border border-stibee-hairline rounded-[4px] text-stibee-caption">
            <span
              className={`w-2 h-2 rounded-full ${
                servingHealthy ? 'bg-stibee-ink' : 'bg-stibee-coral'
              }`}
            />
            <span>FastAPI 8077 / 8099 서빙 정상</span>
          </div>

          <div className="text-stibee-caption hidden lg:block">
            2026.10.01 (목)
          </div>

          <div className="text-stibee-ink font-medium pl-3 border-l border-stibee-hairline">
            이승민
          </div>
        </div>
      </div>
    </header>
  );
};
