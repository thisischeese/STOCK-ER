import React from 'react';
import { TabType } from '../../types';

interface SidebarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  onCloseMobile,
}) => {
  const menuItems: { id: TabType; num: string; label: string }[] = [
    { id: 'overview', num: '01', label: '오늘의 요약' },
    { id: 'sales', num: '02', label: '판매 예측' },
    { id: 'inventory', num: '03', label: '재고, 사입 계획' },
    { id: 'operations', num: '04', label: '모델 운영' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-stibee-hairline h-full flex flex-col justify-between py-6 px-4 shrink-0 select-none">
      {/* Top Branding */}
      <div>
        <div className="mb-8 px-2">
          <div className="flex items-center gap-1.5 font-bold text-2xl tracking-tight text-stibee-ink font-sans">
            <span>STOCK</span>
            <span className="text-stibee-coral">-</span>
            <span>ER</span>
          </div>
          <div className="text-xs text-stibee-caption mt-1 font-normal">
            판매와 재고를 함께 보다
          </div>
        </div>

        {/* Workspace Nav Header */}
        <div className="px-2 mb-2 text-[11px] font-semibold text-stibee-caption tracking-wider uppercase">
          Workspace
        </div>

        {/* Navigation Menu Items */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[4px] text-sm text-left transition-colors duration-150 ${
                  isActive
                    ? 'bg-stibee-surface text-stibee-ink font-semibold border-l-2 border-stibee-coral pl-2.5'
                    : 'text-stibee-ink hover:bg-stibee-surface hover:text-[#9d9ea2] font-normal'
                }`}
              >
                <span
                  className={`text-xs ${
                    isActive ? 'text-stibee-coral font-semibold' : 'text-stibee-caption'
                  }`}
                >
                  {item.num}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Info */}
      <div className="px-2 pt-6 border-t border-stibee-hairline text-[11px] text-stibee-caption leading-relaxed">
        <div>5조 (화면 설계 초안)</div>
        <div className="text-[#9d9ea2] mt-0.5">데스크톱 / 모바일 반응형</div>
      </div>
    </aside>
  );
};
