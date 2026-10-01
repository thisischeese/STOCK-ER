import React from 'react';

interface NoticeBannerProps {
  message?: string;
}

export const NoticeBanner: React.FC<NoticeBannerProps> = ({
  message = '화면 흐름을 검토하는 와이어프레임입니다. 예측, 재고, 모델 성능은 설명용 샘플이며 실제 학습 결과가 아닙니다.',
}) => {
  return (
    <div className="w-full bg-[#fbfbfb] border border-dashed border-stibee-border rounded-[4px] px-4 py-3 text-xs text-stibee-muted leading-relaxed">
      {message}
    </div>
  );
};
