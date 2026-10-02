import React, { useState, useMemo } from 'react';
import { DailySalesDataPoint } from '../../types';

interface DemandLineChartProps {
  data: DailySalesDataPoint[];
  height?: number;
}

export const DemandLineChart: React.FC<DemandLineChartProps> = ({
  data,
  height = 290,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const paddingLeft = 45;
  const paddingRight = 35;
  const paddingTop = 36;
  const paddingBottom = 42;
  const width = 800; // viewBox width

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const allValues = data.flatMap((d) => [d.actual, d.predicted]);
  const minVal = Math.floor(Math.min(...allValues) * 0.85);
  const maxVal = Math.ceil(Math.max(...allValues) * 1.12);

  const getX = (index: number) => {
    return paddingLeft + (index / (data.length - 1 || 1)) * chartWidth;
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / (maxVal - minVal || 1);
    return height - paddingBottom - ratio * chartHeight;
  };

  // Generate SVG paths
  const actualPath = data.reduce((acc, curr, idx) => {
    const x = getX(idx);
    const y = getY(curr.actual);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const predictedPath = data.reduce((acc, curr, idx) => {
    const x = getX(idx);
    const y = getY(curr.predicted);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const yTicks = [
    minVal,
    Math.round(minVal + (maxVal - minVal) * 0.33),
    Math.round(minVal + (maxVal - minVal) * 0.66),
    maxVal,
  ];

  // Smart sampling of X-axis labels to prevent any adjacent horizontal collisions
  const xLabelIndices = useMemo(() => {
    if (data.length <= 1) return [0];
    const maxLabels = 7;
    const step = Math.max(1, Math.floor(data.length / maxLabels));
    const indices: number[] = [];
    for (let i = 0; i < data.length; i += step) {
      indices.push(i);
    }
    const lastIndex = data.length - 1;
    if (!indices.includes(lastIndex)) {
      if (indices.length > 0 && lastIndex - indices[indices.length - 1] < 2) {
        indices[indices.length - 1] = lastIndex;
      } else {
        indices.push(lastIndex);
      }
    }
    return indices;
  }, [data.length]);

  const activePoint = hoverIndex !== null ? data[hoverIndex] : data[data.length - 1];
  const isHovering = hoverIndex !== null;

  return (
    <div className="w-full select-none space-y-3">
      {/* Top Dedicated Metrics Inspector Bar (Outside SVG Plot to prevent overlaps) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 bg-stibee-surface border border-stibee-hairline rounded-[4px] text-xs min-h-[40px]">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 font-medium text-stibee-ink">
            <span className="text-stibee-caption font-normal">
              {isHovering ? '선택 일자:' : '최신 집계일:'}
            </span>
            <span className="font-semibold">
              {activePoint.date} ({activePoint.dayOfWeek})
            </span>
            {activePoint.isWeekend && (
              <span className="text-[10px] text-stibee-muted bg-white border border-stibee-hairline px-1.5 py-0.5 rounded-[2px]">
                주말 집중
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-stibee-muted">
            <span className="inline-block w-2.5 h-[2px] bg-[#202124]" />
            <span>실제 판매:</span>
            <strong className="text-stibee-ink font-semibold">{activePoint.actual}개</strong>
          </div>

          <div className="flex items-center gap-1 text-stibee-muted">
            <span className="inline-block w-2.5 h-[2px] border-t-2 border-dashed border-[#ff6464]" />
            <span>모델 예측:</span>
            <strong className="text-stibee-coral font-semibold">{activePoint.predicted}개</strong>
          </div>

          <div className="text-stibee-caption pl-3 border-l border-stibee-hairline flex items-center gap-1.5">
            <span>예측 오차:</span>
            <span className="font-medium text-stibee-ink">
              {Math.abs(activePoint.actual - activePoint.predicted)}개
            </span>
            <span className="text-[11px] text-stibee-caption">
              ({(((Math.abs(activePoint.actual - activePoint.predicted)) / (activePoint.actual || 1)) * 100).toFixed(1)}%)
            </span>
          </div>
        </div>

        <div className="text-[11px] text-stibee-caption hidden md:block">
          {isHovering
            ? '마우스를 이동하여 다른 일자의 예측 정확도를 조회할 수 있습니다'
            : '차트 위에 마우스를 올리면 일자별 정밀 수치가 표시됩니다'}
        </div>
      </div>

      {/* SVG Plot Area */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
        >
          {/* Weekend Shading Bands */}
          {data.map((item, idx) => {
            if (!item.isWeekend) return null;
            const x = getX(idx);
            const bandWidth = chartWidth / (data.length - 1 || 1);
            const startX = Math.max(paddingLeft, x - bandWidth / 2);
            const endX = Math.min(width - paddingRight, x + bandWidth / 2);
            return (
              <rect
                key={`weekend-${idx}`}
                x={startX}
                y={paddingTop}
                width={Math.max(0, endX - startX)}
                height={chartHeight}
                fill="#f8f8f8"
              />
            );
          })}

          {/* Horizontal Grid lines and Y labels */}
          {yTicks.map((tickVal) => {
            const y = getY(tickVal);
            return (
              <g key={tickVal}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#ebebeb"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="11"
                  fill="#747579"
                  className="font-sans"
                >
                  {tickVal}
                </text>
              </g>
            );
          })}

          {/* Drift Start Marker Line (10.01) */}
          {data.map((item, idx) => {
            if (item.date !== '10.01') return null;
            const x = getX(idx);
            return (
              <g key="drift-marker">
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="#ff6464"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
                {/* Background pill badge for clear contrast without overlap */}
                <rect
                  x={x + 4}
                  y={paddingTop - 1}
                  width={106}
                  height={18}
                  rx="3"
                  fill="#ffffff"
                  stroke="#ff6464"
                  strokeWidth="0.8"
                />
                <text
                  x={x + 8}
                  y={paddingTop + 12}
                  fill="#ff6464"
                  fontSize="10"
                  className="font-medium font-sans"
                >
                  10.01 빠른 배송 개시
                </text>
              </g>
            );
          })}

          {/* X Axis Date Labels (Filtered using smart sampling to prevent horizontal text collision) */}
          {xLabelIndices.map((idx) => {
            const item = data[idx];
            if (!item) return null;
            const x = getX(idx);
            return (
              <text
                key={item.date}
                x={x}
                y={height - 14}
                textAnchor="middle"
                fontSize="11"
                fill={item.isWeekend ? '#202124' : '#747579'}
                className={item.isWeekend ? 'font-medium' : 'font-normal'}
              >
                {item.date} ({item.dayOfWeek})
              </text>
            );
          })}

          {/* Predicted Demand Line (Stibee Coral dashed) */}
          <path
            d={predictedPath}
            fill="none"
            stroke="#ff6464"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinecap="round"
          />

          {/* Actual Sales Line (Stibee Ink solid) */}
          <path
            d={actualPath}
            fill="none"
            stroke="#202124"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Interactive Pointer Points and Vertical Hover Guide */}
          {data.map((point, idx) => {
            const x = getX(idx);
            const actualY = getY(point.actual);
            const predY = getY(point.predicted);
            const isHovered = hoverIndex === idx;

            return (
              <g key={point.date}>
                {/* Hit Box Area */}
                <rect
                  x={x - 18}
                  y={paddingTop}
                  width={36}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                />

                {isHovered && (
                  <>
                    <line
                      x1={x}
                      y1={paddingTop}
                      x2={x}
                      y2={height - paddingBottom}
                      stroke="#bcbdc1"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle cx={x} cy={actualY} r="4.5" fill="#202124" stroke="#ffffff" strokeWidth="2" />
                    <circle cx={x} cy={predY} r="4.5" fill="#ff6464" stroke="#ffffff" strokeWidth="2" />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend & Clarifications */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-stibee-hairline text-xs text-stibee-caption">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-5 h-[2px] bg-[#202124] inline-block" />
            <span className="text-stibee-ink">실제 판매 실적 (주문 집계)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-[2px] border-t-2 border-dashed border-[#ff6464] inline-block" />
            <span className="text-stibee-coral font-medium">GRU 모델 예측치</span>
          </div>
          <div className="flex items-center gap-1.5 text-stibee-caption">
            <span className="w-3 h-3 bg-[#f8f8f8] border border-stibee-hairline inline-block rounded-[2px]" />
            <span>주말 구간 (금, 토, 일 발주 집중)</span>
          </div>
        </div>

        <div className="text-[11px] text-stibee-caption">
          과거 20일 시계열 입력 기반 GRU 32-16 추론 결과
        </div>
      </div>
    </div>
  );
};
