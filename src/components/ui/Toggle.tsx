import type { ReactNode } from 'react';
import './toggle.css';

export function Toggle({ checked, onChange, disabled = false, label, children }: {
  checked: boolean; onChange(checked: boolean): void; disabled?: boolean; label: string; children?: ReactNode;
}) {
  return <div className="calla-toggle-control">
    <button type="button" role="switch" className="calla-toggle" aria-label={label} aria-checked={checked}
      disabled={disabled} onClick={() => onChange(!checked)}><span className="calla-toggle-thumb" /></button>
    {children && <span className="calla-toggle-value">{children}</span>}
  </div>;
}
