import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  description: string;
  deltaText?: string;
  isAlert?: boolean;
  highlight?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit = '',
  description,
  deltaText,
  isAlert = false,
  highlight = false,
}) => {
  const shouldAlert = isAlert || highlight;

  return (
    <div className="bg-white border border-stibee-hairline rounded-[4px] p-5 flex flex-col justify-between transition-colors hover:border-stibee-border">
      <div className="text-xs font-normal text-stibee-caption mb-3">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 my-1">
        <span
          className={`text-3xl font-semibold tracking-tight ${
            shouldAlert ? 'text-stibee-coral' : 'text-stibee-ink'
          }`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm font-normal text-stibee-muted">
            {unit}
          </span>
        )}
        {deltaText && (
          <span
            className={`text-xs ml-2 font-medium ${
              isAlert ? 'text-stibee-coral' : 'text-stibee-muted'
            }`}
          >
            {deltaText}
          </span>
        )}
      </div>
      <div className="text-xs text-stibee-caption mt-2">
        {description}
      </div>
    </div>
  );
};
