import React, { useState } from 'react';
import { DailySalesDataPoint } from '../../types';

interface DemandLineChartProps {
  data: DailySalesDataPoint[];
  height?: number;
}

export const DemandLineChart: React.FC<DemandLineChartProps> = ({
  data,
  height = 280,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const paddingLeft = 45;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;
  const width = 800; // viewBox width

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const allValues = data.flatMap((d) => [d.actual, d.predicted]);
  const minVal = Math.floor(Math.min(...allValues) * 0.85);
  const maxVal = Math.ceil(Math.max(...allValues) * 1.12);

  const getX = (index: number) => {
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
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

  return (
    <div className="w-full select-none">
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
        >
          {/* Weekend Shading Bands */}
          {data.map((item, idx) => {
            if (!item.isWeekend) return null;
            const x = getX(idx);
            const bandWidth = chartWidth / (data.length - 1);
            return (
              <rect
                key={`weekend-${idx}`}
                x={x - bandWidth / 2}
                y={paddingTop}
                width={bandWidth}
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
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={x + 6}
                  y={paddingTop + 14}
                  fill="#ff6464"
                  fontSize="10"
                  className="font-medium"
                >
                  10.01 빠른 배송 개시
                </text>
              </g>
            );
          })}

          {/* X Axis Date Labels */}
          {data.map((item, idx) => {
            // Show every 2nd or 3rd label for breathing room
            if (idx % 2 !== 0 && idx !== data.length - 1) return null;
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

          {/* Interactive Pointer Points */}
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
                    />
                    <circle cx={x} cy={actualY} r="4" fill="#202124" stroke="#ffffff" strokeWidth="2" />
                    <circle cx={x} cy={predY} r="4" fill="#ff6464" stroke="#ffffff" strokeWidth="2" />
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Box */}
        {hoverIndex !== null && (
          <div className="absolute top-2 right-4 bg-white border border-stibee-hairline rounded-[4px] px-3.5 py-2 text-xs flex items-center gap-4 pointer-events-none transition-all">
            <div className="flex items-center gap-1.5 font-medium text-stibee-ink">
              <span>{data[hoverIndex].date} ({data[hoverIndex].dayOfWeek})</span>
              {data[hoverIndex].isWeekend && (
                <span className="text-[10px] text-stibee-muted bg-stibee-surface px-1 py-0.2 rounded-[2px]">
                  주말
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-stibee-muted">
              <span className="inline-block w-2.5 h-0.5 bg-[#202124]" />
              <span>실제 판매:</span>
              <strong className="text-stibee-ink">{data[hoverIndex].actual}개</strong>
            </div>
            <div className="flex items-center gap-1 text-stibee-muted">
              <span className="inline-block w-2.5 h-0.5 border-t-2 border-dashed border-[#ff6464]" />
              <span>모델 예측:</span>
              <strong className="text-stibee-coral">{data[hoverIndex].predicted}개</strong>
            </div>
            <div className="text-[11px] text-stibee-caption pl-1 border-l border-stibee-hairline">
              오차: {Math.abs(data[hoverIndex].actual - data[hoverIndex].predicted)}개
            </div>
          </div>
        )}
      </div>

      {/* Legend & Clarifications */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-3 border-t border-stibee-hairline text-xs text-stibee-caption">
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
            <span>주말 구간 (금-일 발주 집중)</span>
          </div>
        </div>

        <div className="text-[11px] text-stibee-caption">
          최근 20일 시계열 입력 기반 GRU 32-16 추론 결과
        </div>
      </div>
    </div>
  );
};
