import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TabType, PlatformId } from '../../types';

interface MainLayoutProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedPlatform: PlatformId;
  onPlatformChange: (platform: PlatformId) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentTab,
  onTabChange,
  selectedPlatform,
  onPlatformChange,
  title,
  description,
  children,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-stibee-ink">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar currentTab={currentTab} onTabChange={onTabChange} />
      </div>

      {/* Mobile Drawer Sidebar */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative z-10 w-64 h-full bg-white shadow-xl animate-in slide-in-from-left duration-200">
            <Sidebar
              currentTab={currentTab}
              onTabChange={onTabChange}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-10 max-w-6xl mx-auto w-full">
          {/* Page Top Heading Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] font-semibold text-stibee-caption tracking-widest uppercase mb-1">
                Sell Smart. Stock Right.
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-stibee-ink">
                {title}
              </h1>
              <p className="text-sm font-normal text-stibee-muted mt-1.5">
                {description}
              </p>
            </div>

            {/* Platform Selector Dropdown */}
            <div className="flex flex-col gap-1 items-start md:items-end shrink-0">
              <label htmlFor="platform-select" className="text-xs text-stibee-caption">
                플랫폼
              </label>
              <select
                id="platform-select"
                value={selectedPlatform}
                onChange={(e) => onPlatformChange(e.target.value as PlatformId)}
                className="h-10 px-3 py-1.5 text-sm bg-white border border-stibee-border rounded-[4px] text-stibee-ink hover:border-stibee-muted focus:border-stibee-borderFocus focus:outline-none transition-colors cursor-pointer min-w-[140px]"
              >
                <option value="all">전체 플랫폼</option>
                <option value="brandi">브랜디</option>
                <option value="zigzag">지그재그</option>
                <option value="ably">에이블리</option>
              </select>
            </div>
          </div>

          {/* Page Contents */}
          <div className="space-y-6 pb-12">
            {children}
          </div>

          {/* Bottom Footer Note */}
          <footer className="pt-6 pb-12 text-xs text-stibee-caption border-t border-stibee-hairline flex items-center justify-between">
            <span>STOCK-ER (재고 권고는 담당자 검토 후 실행합니다)</span>
            <span>AIOps MLOps Pipeline Serving Dashboard</span>
          </footer>
        </main>
      </div>
    </div>
  );
};
