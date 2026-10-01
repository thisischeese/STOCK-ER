import React, { useState } from 'react';
import { ChartDataPoint } from '../../types';

interface SimpleLineChartProps {
  data: ChartDataPoint[];
}

export const SimpleLineChart: React.FC<SimpleLineChartProps> = ({ data }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Chart layout dimensions
  const width = 640;
  const height = 240;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const minY = 30;
  const maxY = 180;
  const yRange = maxY - minY;

  const getX = (index: number) => paddingLeft + (index / (data.length - 1)) * chartWidth;
  const getY = (val: number) => height - paddingBottom - ((val - minY) / yRange) * chartHeight;

  // Generate SVG path for actual (solid line)
  const actualPath = data.reduce((acc, point, idx) => {
    const x = getX(idx);
    const y = getY(point.actual);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  // Generate SVG path for predicted (dotted/dashed line)
  const predictedPath = data.reduce((acc, point, idx) => {
    const x = getX(idx);
    const y = getY(point.predicted);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const yTicks = [30, 80, 130, 180];

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-56 sm:h-64 select-none"
        >
          {/* Horizontal grid lines and Y-axis labels */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
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
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#747579"
                  fontFamily="Pretendard, sans-serif"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          <text
            x={getX(0)}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill="#747579"
          >
            09.18
          </text>
          <text
            x={getX(6)}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill="#747579"
          >
            09.24
          </text>
          <text
            x={getX(data.length - 1)}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill="#747579"
          >
            10.01
          </text>

          {/* Dotted Predicted Line (Stibee Coral dashed) */}
          <path
            d={predictedPath}
            fill="none"
            stroke="#ff6464"
            strokeWidth="2.2"
            strokeDasharray="4 3"
            strokeLinecap="round"
          />

          {/* Solid Actual Line (Stibee Ink) */}
          <path
            d={actualPath}
            fill="none"
            stroke="#202124"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Hover interactive vertical line and points */}
          {data.map((point, idx) => {
            const x = getX(idx);
            const actualY = getY(point.actual);
            const predY = getY(point.predicted);
            const isHovered = hoverIndex === idx;

            return (
              <g key={idx}>
                {/* Transparent hit area */}
                <rect
                  x={x - 15}
                  y={paddingTop}
                  width={30}
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
                      stroke="#ff6464"
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

        {/* Hover Tooltip Box */}
        {hoverIndex !== null && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 bg-white border border-stibee-hairline rounded-[4px] px-3 py-1.5 text-xs flex items-center gap-4 pointer-events-none"
          >
            <span className="font-semibold text-stibee-ink">
              {data[hoverIndex].date}
            </span>
            <span className="text-stibee-muted flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 bg-[#202124]" />
              실제: <strong className="text-stibee-ink">{data[hoverIndex].actual}개</strong>
            </span>
            <span className="text-stibee-muted flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 border-t-2 border-dashed border-[#ff6464]" />
              예측: <strong className="text-stibee-coral">{data[hoverIndex].predicted}개</strong>
            </span>
          </div>
        )}
      </div>

      {/* Chart Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 text-xs text-stibee-caption">
        <div className="flex items-center gap-2">
          <span className="w-5 h-[2px] bg-[#202124] inline-block" />
          <span>실제 판매량 (샘플)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-[2px] border-t-2 border-dashed border-[#ff6464] inline-block" />
          <span>예측 판매량 (샘플)</span>
        </div>
      </div>
    </div>
  );
};
