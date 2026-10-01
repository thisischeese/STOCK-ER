import React, { useState } from 'react';
import { NavigationTab } from './types';
import { Header } from './components/layout/Header';
import { ForecastPage } from './pages/ForecastPage';
import { InventoryPage } from './pages/InventoryPage';
import { AIOpsPage } from './pages/AIOpsPage';
import { ServingPage } from './pages/ServingPage';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('forecast');

  const renderCurrentPage = () => {
    switch (currentTab) {
      case 'forecast':
        return <ForecastPage onNavigateTab={setCurrentTab} />;
      case 'inventory':
        return <InventoryPage />;
      case 'aiops':
        return <AIOpsPage />;
      case 'serving':
        return <ServingPage />;
      default:
        return <ForecastPage onNavigateTab={setCurrentTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-stibee-ink selection:bg-stibee-coral/10 selection:text-stibee-coral">
      {/* Global Stibee Header Navigation */}
      <Header currentTab={currentTab} onTabChange={setCurrentTab} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {renderCurrentPage()}
      </main>

      {/* Minimal Stibee Footer */}
      <footer className="border-t border-stibee-hairline bg-white py-8 text-xs text-stibee-caption">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stibee-ink">STOCKER</span>
            <span className="text-stibee-subtle">|</span>
            <span>패션 이커머스 수요 예측 및 AIOps 운영 플랫폼</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-stibee-caption">
            <span>FastAPI 로컬 서빙 (8077)</span>
            <span>Docker 컨테이너 서빙 (8099)</span>
            <span>MLflow Model Registry</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
