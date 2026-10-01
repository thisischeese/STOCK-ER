import React from 'react';

interface StatusBadgeProps {
  variant?: 'normal' | 'warning' | 'urgent' | 'low';
  status?: 'normal' | 'warning' | 'urgent' | 'low';
  label: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ variant, status, label }) => {
  const currentVariant = variant || status || 'normal';

  if (currentVariant === 'urgent' || currentVariant === 'warning') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-normal rounded-[4px] bg-[#fff8f8] text-stibee-coral border border-stibee-coral/30">
        {label}
      </span>
    );
  }

  if (currentVariant === 'low') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-normal rounded-[4px] bg-stibee-surface text-stibee-ink border border-stibee-border">
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-normal rounded-[4px] bg-stibee-surface text-stibee-muted border border-stibee-hairline">
      {label}
    </span>
  );
};
