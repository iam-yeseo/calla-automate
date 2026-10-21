import { useId } from 'react';
import './progress.css';

export function Progress({ completed, total, label, description, paused = false }: {
  completed: number; total: number; label: string; description: string; paused?: boolean;
}) {
  const id = useId();
  const value = total > 0 ? Math.min(100, Math.max(0, Math.floor(completed / total * 100))) : 0;
  return <div className="calla-progress" data-paused={paused || undefined}>
    <div className="calla-progress-heading"><strong id={`${id}-label`}>{label}</strong><span>{value}%</span></div>
    <div className="calla-progress-track" role="progressbar" aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${total}건 중 ${completed}건 반영 확인, ${value}%`}>
      <span className="calla-progress-indicator" style={{ width: `${value}%` }} />
    </div>
    <div className="calla-progress-caption"><span>{completed} / {total}건 반영 확인</span><span id={`${id}-description`} role="status">{description}</span></div>
  </div>;
}
