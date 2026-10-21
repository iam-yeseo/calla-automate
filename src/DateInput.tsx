import { useEffect, useId, useRef, useState } from 'react';
import { Calendar, calendarDate, calendarDateKey } from './components/ui/Calendar';
import { FloatingPopover } from './components/ui/FloatingPopover';

type DateInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-describedby'?: string;
};

const displayDate = (value: string) => value.replaceAll('-', '/');

function parseDate(value: string): string | null {
  const match = /^(\d{4})[/-]?(\d{2})[/-]?(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

export function DateInput({ id, value, onChange, disabled, 'aria-describedby': describedBy }: DateInputProps) {
  const [draft, setDraft] = useState(() => displayDate(value));
  const [open, setOpen] = useState(false);
  const calendarButton = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  useEffect(() => { setDraft(displayDate(value)); }, [value]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const finishEditing = () => {
    const date = parseDate(draft);
    setDraft(displayDate(date || value));
    if (date && date !== value) onChange(date);
  };

  return <div className={`date-input ${disabled ? 'is-disabled' : ''}`}>
    <input id={id} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
      placeholder="yyyy/mm/dd" maxLength={10} disabled={disabled} value={draft}
      aria-describedby={describedBy} aria-invalid={!!draft && !parseDate(draft)}
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        const date = parseDate(next);
        if (date && date !== value) onChange(date);
      }} onBlur={finishEditing} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); finishEditing(); }
        if (event.key === 'Escape') { event.preventDefault(); setDraft(displayDate(value)); }
      }} />
    <button ref={calendarButton} className="date-calendar" type="button" aria-label="달력에서 날짜 선택"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      disabled={disabled} onClick={() => { finishEditing(); setOpen(previous => !previous); }}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
        <rect x="3.5" y="4.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.5 3v3M13.5 3v3M4 8.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
    <FloatingPopover open={open && !disabled} onOpenChange={setOpen} anchorRef={calendarButton} align="end"
      id={popupId} role="dialog" aria-label="날짜 선택 달력" className="calla-calendar-popover">
      {open && <Calendar selected={parseDate(value) ? calendarDate(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : undefined}
        onSelect={date => {
          const next = calendarDateKey(date);
          setDraft(displayDate(next));
          if (next !== value) onChange(next);
          setOpen(false);
          requestAnimationFrame(() => calendarButton.current?.focus({ preventScroll: true }));
        }} />}
    </FloatingPopover>
  </div>;
}
