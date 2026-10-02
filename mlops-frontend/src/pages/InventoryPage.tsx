import React, { useState, useMemo } from 'react';
import {
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  CheckCircle,
} from 'lucide-react';
import { FashionProductItem } from '../types';
import { mockFashionProducts } from '../mock/mockData';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { CalculationModal } from '../components/common/CalculationModal';

type SortField =
  | 'sku'
  | 'name'
  | 'primaryChannel'
  | 'salesShare'
  | 'threeDaysDemand'
  | 'currentStock'
  | 'incomingStock'
  | 'safetyStock'
  | 'recommendedRestock'
  | 'wholesalePrice'
  | 'stockStatus';

type SortOrder = 'asc' | 'desc';

export const InventoryPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [activeProductForModal, setActiveProductForModal] = useState<FashionProductItem | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('modal') === '1') {
      return mockFashionProducts[0];
    }
    return null;
  });
  const [downloadSuccessToast, setDownloadSuccessToast] = useState(false);
  const [orderConfirmedToast, setOrderConfirmedToast] = useState<string | null>(null);

  // Sorting state (default: recommended restock descending)
  const [sortField, setSortField] = useState<SortField>('recommendedRestock');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Filter products
  const filteredProducts = useMemo(() => {
    return mockFashionProducts.filter((product) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);

      const matchesChannel =
        selectedChannelFilter === 'all' || product.primaryChannel.includes(selectedChannelFilter);

      const matchesUrgent = !onlyUrgent || product.stockStatus === 'urgent' || product.stockStatus === 'low';

      return matchesSearch && matchesChannel && matchesUrgent;
    });
  }, [searchQuery, selectedChannelFilter, onlyUrgent]);

  // Sort filtered products
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'stockStatus') {
        const weight: Record<string, number> = { urgent: 3, low: 2, normal: 1 };
        aVal = weight[a.stockStatus] || 0;
        bVal = weight[b.stockStatus] || 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comp = aVal.localeCompare(bVal, 'ko-KR');
        return sortOrder === 'asc' ? comp : -comp;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredProducts, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedChannelFilter('all');
    setOnlyUrgent(false);
  };

  // Dynamic KPI sums based on current filtered view
  const total3DaysDemand = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + p.threeDaysDemand, 0);
  }, [filteredProducts]);

  const totalRestockCount = useMemo(() => {
    return filteredProducts.reduce((sum, p) => sum + p.recommendedRestock, 0);
  }, [filteredProducts]);

  const totalRestockCost = useMemo(() => {
    return filteredProducts.reduce(
      (sum, p) => sum + p.recommendedRestock * p.wholesalePrice,
      0
    );
  }, [filteredProducts]);

  const urgentCount = useMemo(() => {
    return filteredProducts.filter((p) => p.stockStatus === 'urgent').length;
  }, [filteredProducts]);

  const handleExportCsv = () => {
    const headers = [
      '품목코드',
      '상품명',
      '카테고리',
      '주력채널',
      '점유율(%)',
      '3일필요량',
      '현재재고',
      '입고예정',
      '안전재고',
      '권장사입량',
      '도매단가',
      '예상사입액',
      '리드타임(일)',
      '재고상태',
    ];

    const rows = sortedProducts.map((p) => [
      p.sku,
      `"${p.name.replace(/"/g, '""')}"`,
      p.category,
      p.primaryChannel,
      p.salesShare,
      p.threeDaysDemand,
      p.currentStock,
      p.incomingStock,
      p.safetyStock,
      p.recommendedRestock,
      p.wholesalePrice,
      p.recommendedRestock * p.wholesalePrice,
      p.leadTimeDays,
      p.stockStatus,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `dongdaemun_purchase_plan_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccessToast(true);
    setTimeout(() => setDownloadSuccessToast(false), 3500);
  };

  const handleConfirmOrder = (product: FashionProductItem) => {
    setOrderConfirmedToast(`${product.name} (${product.recommendedRestock}개) 사입 발주가 처리되었습니다.`);
    setTimeout(() => setOrderConfirmedToast(null), 4000);
  };

  const handleBatchOrder = () => {
    const restockItems = filteredProducts.filter((p) => p.recommendedRestock > 0);
    if (restockItems.length === 0) {
      setOrderConfirmedToast('현재 조건에서 추가 사입이 필요한 품목이 없습니다.');
      setTimeout(() => setOrderConfirmedToast(null), 3000);
      return;
    }
    setOrderConfirmedToast(
      `발주 대상 ${restockItems.length}개 품목 (총 ${totalRestockCount}개) 사입 발주서가 동대문 도매처에 전송되었습니다.`
    );
    setTimeout(() => setOrderConfirmedToast(null), 4500);
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="text-stibee-subtle opacity-60 ml-1 inline-block" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="text-stibee-coral ml-1 inline-block" />
    ) : (
      <ArrowDown size={12} className="text-stibee-coral ml-1 inline-block" />
    );
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stibee-hairline">
        <div>
          <h1 className="text-3xl font-semibold text-stibee-ink tracking-tight">
            사입 및 재고 계획
          </h1>
          <p className="text-sm text-stibee-muted mt-1 leading-relaxed">
            동대문 20개 사입 품목의 3일간 예상 소진량 및 안전재고(20%)를 감안한 자동 발주 권고표입니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleBatchOrder}
            className="h-[42px] px-4 bg-white border border-stibee-border hover:bg-stibee-surface text-stibee-ink text-sm font-medium rounded-[4px] transition-colors flex items-center gap-2"
          >
            <CheckCircle size={15} className="text-stibee-coral" />
            <span>권장 사입 일괄 발주</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-[42px] px-5 bg-stibee-coral hover:bg-stibee-coralHover text-white text-sm font-medium rounded-[4px] transition-colors flex items-center gap-2"
          >
            <Download size={15} />
            <span>사입 발주서 CSV 내보내기</span>
          </button>
        </div>
      </div>

      {downloadSuccessToast && (
        <div className="p-3 bg-stibee-surface border border-stibee-border rounded-[4px] text-xs text-stibee-ink flex items-center justify-between animate-in fade-in duration-150">
          <span>동대문 사입 발주서 CSV 파일이 정상적으로 다운로드되었습니다. (UTF-8 Excel 호환 포맷)</span>
          <span className="text-stibee-caption font-medium">다운로드 완료</span>
        </div>
      )}

      {orderConfirmedToast && (
        <div className="p-3 bg-stibee-surface border border-stibee-border rounded-[4px] text-xs text-stibee-ink flex items-center justify-between animate-in fade-in duration-150">
          <span>{orderConfirmedToast}</span>
          <span className="text-stibee-coral font-medium">발주 접수</span>
        </div>
      )}

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="3일 총 예상 수요량"
          value={total3DaysDemand}
          unit="개"
          description={`조회 범위 ${filteredProducts.length}개 품목의 3일간 합산 수요`}
        />
        <MetricCard
          label="총 추가 사입 권고 수량"
          value={totalRestockCount}
          unit="개"
          isAlert={totalRestockCount > 0}
          deltaText={`${filteredProducts.filter((p) => p.recommendedRestock > 0).length}개 품목`}
          description="재고 부족 및 안전재고 미달분"
        />
        <MetricCard
          label="예상 사입 총 소요액"
          value={`${(totalRestockCost / 10000).toFixed(0)}만`}
          unit="원"
          description="동대문 도매단가 기준 합산"
        />
        <MetricCard
          label="품절 위험 긴급 품목"
          value={urgentCount}
          unit="종"
          isAlert={urgentCount > 0}
          deltaText="1일 미만 잔여"
          description="즉시 동대문 사입 발주 필요"
        />
      </div>

      {/* Formula Explanation Bar */}
      <div className="p-4 bg-stibee-surface border border-stibee-hairline rounded-[4px] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-stibee-ink">사입 산출 공식:</span>
          <span className="font-mono text-[11px] text-stibee-muted">
            권장 사입량 = max(0, 3일 필요량 + 안전재고(20%) - 현재 창고 재고 - 3일 내 입고 예정)
          </span>
        </div>
        <div className="text-[11px] text-stibee-caption">
          동대문 사입 리드타임: 통상 2~3일 소요
        </div>
      </div>

      {/* Product List Section */}
      <div className="bg-white border border-stibee-hairline rounded-[4px] p-6 space-y-4">
        {/* Table Controls (Search & Filters) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-stibee-hairline">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="상품명, SKU, 카테고리 검색"
                className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink placeholder:text-stibee-subtle focus:outline-none focus:border-stibee-borderFocus"
              />
              <Search size={14} className="absolute left-2.5 top-2.5 text-stibee-caption" />
            </div>

            {/* Channel Filter */}
            <select
              value={selectedChannelFilter}
              onChange={(e) => setSelectedChannelFilter(e.target.value)}
              className="h-9 px-3 text-xs bg-white border border-stibee-border rounded-[4px] text-stibee-ink focus:outline-none focus:border-stibee-borderFocus"
            >
              <option value="all">전체 주력 채널</option>
              <option value="브랜디">브랜디</option>
              <option value="지그재그">지그재그</option>
              <option value="에이블리">에이블리</option>
            </select>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-stibee-ink select-none">
              <input
                type="checkbox"
                checked={onlyUrgent}
                onChange={(e) => setOnlyUrgent(e.target.checked)}
                className="rounded-[2px] border-stibee-border accent-stibee-coral"
              />
              <span>발주 필요 품목만 보기</span>
            </label>

            <span className="text-stibee-caption pl-3 border-l border-stibee-hairline">
              총 {sortedProducts.length}개 품목 표시
            </span>
          </div>
        </div>

        {/* 20-Item Detailed Table or Empty State */}
        {sortedProducts.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm font-medium text-stibee-ink">
              일치하는 사입 품목이 없습니다.
            </p>
            <p className="text-xs text-stibee-caption">
              검색어나 필터 조건을 변경하거나 초기화해 주시기 바랍니다.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-stibee-ink bg-stibee-surface border border-stibee-border rounded-[4px] hover:bg-white transition-colors"
            >
              <RotateCcw size={13} />
              <span>검색 필터 초기화</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stibee-hairline text-stibee-caption select-none">
                  <th
                    onClick={() => handleSort('sku')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    품목코드 {renderSortIndicator('sku')}
                  </th>
                  <th
                    onClick={() => handleSort('name')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    상품명 {renderSortIndicator('name')}
                  </th>
                  <th
                    onClick={() => handleSort('primaryChannel')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    주력 채널 {renderSortIndicator('primaryChannel')}
                  </th>
                  <th
                    onClick={() => handleSort('salesShare')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    판매 비중 {renderSortIndicator('salesShare')}
                  </th>
                  <th
                    onClick={() => handleSort('threeDaysDemand')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    3일 필요량 {renderSortIndicator('threeDaysDemand')}
                  </th>
                  <th
                    onClick={() => handleSort('currentStock')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    현재 재고 {renderSortIndicator('currentStock')}
                  </th>
                  <th
                    onClick={() => handleSort('incomingStock')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    입고 예정 {renderSortIndicator('incomingStock')}
                  </th>
                  <th
                    onClick={() => handleSort('safetyStock')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    안전재고 {renderSortIndicator('safetyStock')}
                  </th>
                  <th
                    onClick={() => handleSort('recommendedRestock')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    권장 사입량 {renderSortIndicator('recommendedRestock')}
                  </th>
                  <th
                    onClick={() => handleSort('wholesalePrice')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    도매단가 {renderSortIndicator('wholesalePrice')}
                  </th>
                  <th
                    onClick={() => handleSort('stockStatus')}
                    className="py-3 px-3 font-normal cursor-pointer hover:text-stibee-ink transition-colors"
                  >
                    상태 {renderSortIndicator('stockStatus')}
                  </th>
                  <th className="py-3 px-3 font-normal text-right">계산 상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stibee-hairline">
                {sortedProducts.map((item) => (
                  <tr key={item.id} className="hover:bg-stibee-surface transition-colors">
                    <td className="py-3.5 px-3 font-mono text-[11px] text-stibee-caption">
                      {item.sku}
                    </td>
                    <td className="py-3.5 px-3 text-stibee-ink font-medium max-w-[200px] truncate">
                      {item.name}
                    </td>
                    <td className="py-3.5 px-3 text-stibee-muted">
                      {item.primaryChannel}
                    </td>
                    <td className="py-3.5 px-3 text-stibee-caption">
                      {item.salesShare}%
                    </td>
                    <td className="py-3.5 px-3 text-stibee-ink font-medium">
                      {item.threeDaysDemand}개
                    </td>
                    <td className="py-3.5 px-3 text-stibee-muted">
                      {item.currentStock}개
                    </td>
                    <td className="py-3.5 px-3 text-stibee-caption">
                      {item.incomingStock}개
                    </td>
                    <td className="py-3.5 px-3 text-stibee-caption">
                      {item.safetyStock}개
                    </td>
                    <td className="py-3.5 px-3 font-semibold">
                      {item.recommendedRestock > 0 ? (
                        <span className="text-stibee-coral bg-[#fff8f8] px-2 py-0.5 rounded-[4px] border border-stibee-coral/30">
                          {item.recommendedRestock}개
                        </span>
                      ) : (
                        <span className="text-stibee-caption">0개</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-stibee-muted">
                      {item.wholesalePrice.toLocaleString()}원
                    </td>
                    <td className="py-3.5 px-3">
                      <StatusBadge
                        variant={item.stockStatus}
                        label={
                          item.stockStatus === 'urgent'
                            ? '긴급 발주'
                            : item.stockStatus === 'low'
                            ? '사입 요망'
                            : '재고 양호'
                        }
                      />
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveProductForModal(item)}
                        className="px-2.5 py-1 text-xs text-stibee-ink bg-white border border-stibee-border rounded-[4px] hover:bg-stibee-surface transition-colors"
                      >
                        산출 보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for detailed restock calculation breakdown */}
      {activeProductForModal && (
        <CalculationModal
          product={activeProductForModal}
          onClose={() => setActiveProductForModal(null)}
          onConfirmRestock={handleConfirmOrder}
        />
      )}
    </div>
  );
};
