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
  servingHealthy,
}) => {
  const tabs: { id: NavigationTab; label: string }[] = [
    { id: 'forecast', label: '수요 예측' },
    { id: 'inventory', label: '사입 재고 계획' },
    { id: 'aiops', label: 'AIOps 운영' },
    { id: 'serving', label: '서빙 설정' },
  ];

  const currentDateText = React.useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[now.getDay()];
    return `${year}.${month}.${day} (${dayName})`;
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-stibee-hairline">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-2 cursor-pointer select-none">
          <span className="font-semibold text-xl tracking-tight text-stibee-ink">
            STOCKER
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-stibee-coral -ml-1 mt-0.5" />
        </div>

        {/* Center: Main Navigation Tabs */}
        <nav className="flex items-center space-x-1 h-full overflow-x-auto scrollbar-none">
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

        {/* Right: Realtime Backend Status & Dynamic Date */}
        <div className="flex items-center gap-3 text-xs">
          {servingHealthy !== undefined && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                servingHealthy
                  ? 'bg-[#eefbf0] text-[#1b7e32] border border-[#a3e635]/40'
                  : 'bg-[#fff5f5] text-[#dc2626] border border-[#fca5a5]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  servingHealthy ? 'bg-[#22c55e] animate-pulse' : 'bg-[#ef4444]'
                }`}
              />
              <span>{servingHealthy ? 'FastAPI 8077 연결됨' : 'FastAPI 8077 오프라인'}</span>
            </div>
          )}
          <span className="text-stibee-caption font-normal hidden sm:inline">{currentDateText}</span>
        </div>
      </div>
    </header>
  );
};
