import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { FashionProductItem } from '../../types';

interface CalculationModalProps {
  product: FashionProductItem | null;
  onClose: () => void;
  onConfirmRestock?: (product: FashionProductItem) => void;
}

export const CalculationModal: React.FC<CalculationModalProps> = ({
  product,
  onClose,
  onConfirmRestock,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (product) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [product, onClose]);

  if (!product) return null;

  const totalEstimatedCost = product.recommendedRestock * product.wholesalePrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 transition-opacity">
      <div
        className="w-full max-w-lg bg-white border border-stibee-hairline rounded-[4px] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stibee-hairline">
          <div>
            <div className="text-xs text-stibee-caption">{product.sku}</div>
            <h3 className="text-base font-semibold text-stibee-ink mt-0.5">
              {product.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[4px] text-stibee-caption hover:text-stibee-ink hover:bg-stibee-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 space-y-4 text-xs">
          {/* Formula Display Bar */}
          <div className="p-3 bg-stibee-surface rounded-[4px] border border-stibee-hairline font-mono text-[11px] text-stibee-ink leading-relaxed">
            권장 사입량 = max(0, 3일 필요량({product.threeDaysDemand}) + 안전재고({product.safetyStock}) - 현재 재고({product.currentStock}) - 입고 예정({product.incomingStock}))
          </div>

          {/* Breakdown List */}
          <div className="space-y-2 text-stibee-ink">
            <div className="flex justify-between py-1.5 border-b border-stibee-hairline">
              <span className="text-stibee-muted">동대문 사입 도매가</span>
              <span className="font-medium">{product.wholesalePrice.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stibee-hairline">
              <span className="text-stibee-muted">최근 14일 판매 점유율</span>
              <span className="font-medium">{product.salesShare}% ({product.primaryChannel} 주력)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stibee-hairline">
              <span className="text-stibee-muted">3일 AI 예측 필요량</span>
              <span className="font-medium text-stibee-ink">+{product.threeDaysDemand}개</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stibee-hairline">
              <span className="text-stibee-muted">안전재고 버퍼 (20% 가산)</span>
              <span className="font-medium text-stibee-ink">+{product.safetyStock}개</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stibee-hairline">
              <span className="text-stibee-muted">현재 창고 실재고</span>
              <span className="font-medium text-stibee-muted">-{product.currentStock}개</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stibee-hairline">
              <span className="text-stibee-muted">3일 내 도착 입고 예정</span>
              <span className="font-medium text-stibee-muted">-{product.incomingStock}개</span>
            </div>
            <div className="flex justify-between pt-2 text-sm font-semibold">
              <span className="text-stibee-ink">최종 추가 사입 권고 수량</span>
              <span className="text-stibee-coral">{product.recommendedRestock}개</span>
            </div>
            {product.recommendedRestock > 0 && (
              <div className="flex justify-between text-xs text-stibee-caption pt-0.5">
                <span>예상 사입 총액</span>
                <span className="font-medium text-stibee-ink">{totalEstimatedCost.toLocaleString()}원</span>
              </div>
            )}
          </div>

          <div className="p-3 bg-stibee-surface rounded-[4px] text-[11px] text-stibee-caption leading-relaxed">
            동대문 도매상가 통상 리드타임 {product.leadTimeDays}일과 플랫폼별 반품/결품율을 감안해 산정된 결과입니다.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-stibee-hairline bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs bg-white border border-stibee-border text-stibee-ink rounded-[4px] hover:bg-stibee-surface transition-colors"
          >
            닫기
          </button>
          {product.recommendedRestock > 0 && onConfirmRestock && (
            <button
              type="button"
              onClick={() => {
                onConfirmRestock(product);
                onClose();
              }}
              className="px-4 py-2 text-xs bg-stibee-coral hover:bg-stibee-coralHover text-white font-medium rounded-[4px] transition-colors"
            >
              사입 발주 승인
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
