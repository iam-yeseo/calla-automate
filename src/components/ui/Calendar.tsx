import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

type CalendarView = 'days' | 'months' | 'years';

export type CalendarProps = {
  selected?: Date;
  defaultMonth?: Date;
  onSelect: (date: Date) => void;
  className?: string;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** Build a local calendar day without Date's special handling of years 0–99. */
export function calendarDate(year: number, month: number, day: number): Date {
  const result = new Date(0);
  result.setHours(12, 0, 0, 0);
  result.setFullYear(year, month, day);
  return result;
}

export function calendarDateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Preserve the day when paging, clamping Jan 31 to Feb 28 (or Feb 29). */
export function moveCalendarMonth(date: Date, amount: number): Date {
  const first = calendarDate(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = calendarDate(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return calendarDate(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
}

function sameDay(a: Date | undefined, b: Date): boolean {
  return !!a && calendarDateKey(a) === calendarDateKey(b);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function supportedDate(date: Date): boolean {
  return date.getFullYear() >= 1 && date.getFullYear() <= 9999;
}

function dayLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
}

function Chevron({ next = false }: { next?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d={next ? 'm7.5 5 5 5-5 5' : 'm12.5 5-5 5 5 5'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function Calendar({ selected, defaultMonth, onSelect, className = '' }: CalendarProps) {
  const today = useMemo(() => {
    const now = new Date();
    return calendarDate(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const startingDay = selected ?? defaultMonth ?? today;
  const [month, setMonth] = useState(() => calendarDate(startingDay.getFullYear(), startingDay.getMonth(), 1));
  const [focusedDay, setFocusedDay] = useState(() => startingDay);
  const [view, setView] = useState<CalendarView>('days');
  const [yearStart, setYearStart] = useState(() => Math.min(9988, Math.max(1, startingDay.getFullYear() - 5)));
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(true);
  const gridId = useId();
  const monthLabel = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const frame = requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLButtonElement>('[data-calendar-focus="true"]')?.focus({ preventScroll: true });
      pendingFocus.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [month, view, focusedDay, yearStart]);

  const weeks = useMemo(() => {
    const first = calendarDate(month.getFullYear(), month.getMonth(), 1);
    const days = Array.from({ length: 42 }, (_, index) => calendarDate(first.getFullYear(), first.getMonth(), 1 - first.getDay() + index));
    return Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  }, [month]);

  const focusDay = (date: Date) => {
    if (!supportedDate(date)) return;
    pendingFocus.current = true;
    setFocusedDay(date);
    if (!sameMonth(date, month)) setMonth(calendarDate(date.getFullYear(), date.getMonth(), 1));
    setView('days');
  };

  const openView = (nextView: CalendarView) => {
    pendingFocus.current = true;
    if (nextView === 'years') setYearStart(Math.min(9988, Math.max(1, month.getFullYear() - 5)));
    setView(nextView);
  };

  const movePage = (direction: number) => {
    if (view === 'years') {
      setYearStart(previous => Math.min(9988, Math.max(1, previous + direction * 12)));
      return;
    }
    const next = moveCalendarMonth(month, direction * (view === 'months' ? 12 : 1));
    if (!supportedDate(next)) return;
    setMonth(next);
    setFocusedDay(calendarDate(next.getFullYear(), next.getMonth(), Math.min(focusedDay.getDate(), calendarDate(next.getFullYear(), next.getMonth() + 1, 0).getDate())));
  };

  const onDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const increments: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target: Date | undefined;
    if (event.key in increments) target = calendarDate(date.getFullYear(), date.getMonth(), date.getDate() + increments[event.key]);
    if (event.key === 'Home' || event.key === 'End') target = calendarDate(date.getFullYear(), date.getMonth(), date.getDate() + (event.key === 'Home' ? -date.getDay() : 6 - date.getDay()));
    if (event.key === 'PageUp' || event.key === 'PageDown') target = moveCalendarMonth(date, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
    if (!target) return;
    event.preventDefault();
    focusDay(target);
  };

  const onPickerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('.calla-calendar-picker button') ?? []);
    const index = buttons.indexOf(event.currentTarget);
    const increments: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    let next: number | undefined;
    if (event.key in increments) next = Math.min(buttons.length - 1, Math.max(0, index + increments[event.key]));
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    buttons[next]?.focus({ preventScroll: true });
  };

  const previousDisabled = view === 'years' ? yearStart === 1 : month.getFullYear() === 1 && (view === 'months' || month.getMonth() === 0);
  const nextDisabled = view === 'years' ? yearStart === 9988 : month.getFullYear() === 9999 && (view === 'months' || month.getMonth() === 11);
  const navigationUnit = view === 'years' ? '12년' : view === 'months' ? '해' : '달';

  return <div ref={rootRef} className={`calla-calendar ${className}`}>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{view === 'years' ? `${yearStart}년부터 ${yearStart + 11}년` : monthLabel}</span>
    <div className="calla-calendar-header">
      <button type="button" className="calla-calendar-nav" disabled={previousDisabled} aria-label={`이전 ${navigationUnit}`} onClick={() => movePage(-1)}><Chevron /></button>
      <div className="calla-calendar-heading">
        <button type="button" className={view === 'years' ? 'is-active' : ''} aria-label={`${month.getFullYear()}년 선택`} aria-expanded={view === 'years'} aria-controls={gridId} onClick={() => openView(view === 'years' ? 'days' : 'years')}>{month.getFullYear()}년</button>
        <span aria-hidden="true">/</span>
        <button type="button" className={view === 'months' ? 'is-active' : ''} aria-label={`${month.getMonth() + 1}월 선택`} aria-expanded={view === 'months'} aria-controls={gridId} onClick={() => openView(view === 'months' ? 'days' : 'months')}>{month.getMonth() + 1}월</button>
      </div>
      <button type="button" className="calla-calendar-nav" disabled={nextDisabled} aria-label={`다음 ${navigationUnit}`} onClick={() => movePage(1)}><Chevron next /></button>
    </div>
    {view === 'days' ? <div id={gridId} className="calla-calendar-days" role="grid" aria-label={monthLabel}>
      <div className="calla-calendar-week" role="row">{WEEKDAYS.map((weekday, index) => <span key={weekday} role="columnheader" aria-label={`${weekday}요일`} className={`calla-calendar-weekday ${index === 0 ? 'is-sunday' : ''}`}>{weekday}</span>)}</div>
      {weeks.map((week, index) => <div className="calla-calendar-week" role="row" key={index}>{week.map(date => {
        const isSelected = sameDay(selected, date);
        const isToday = sameDay(today, date);
        const focused = sameDay(focusedDay, date);
        return <div role="gridcell" aria-selected={isSelected} key={calendarDateKey(date)}>
          <button type="button" className={`calla-calendar-day ${!sameMonth(date, month) ? 'is-outside' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
            aria-label={dayLabel(date)} aria-current={isToday ? 'date' : undefined} disabled={!supportedDate(date)} tabIndex={focused ? 0 : -1}
            data-calendar-focus={focused ? 'true' : undefined} data-date={calendarDateKey(date)}
            onFocus={() => setFocusedDay(date)} onKeyDown={event => onDayKeyDown(event, date)} onClick={() => onSelect(date)}>{date.getDate()}</button>
        </div>;
      })}</div>)}
    </div> : <div id={gridId} className="calla-calendar-picker" role="group" aria-label={view === 'months' ? `${month.getFullYear()}년 월 선택` : '연도 선택'}>
      {view === 'months' ? Array.from({ length: 12 }, (_, index) => <button type="button" key={index}
        className={index === month.getMonth() ? 'is-selected' : ''} data-calendar-focus={index === month.getMonth() ? 'true' : undefined}
        onKeyDown={onPickerKeyDown} onClick={() => focusDay(calendarDate(month.getFullYear(), index, 1))}>{index + 1}월</button>) : <>
        <span className="calla-calendar-year-range">{yearStart} – {yearStart + 11}</span>
        {Array.from({ length: 12 }, (_, index) => yearStart + index).map(year => <button type="button" key={year}
          className={year === month.getFullYear() ? 'is-selected' : ''} data-calendar-focus={year === month.getFullYear() || (indexFallbackYear(month.getFullYear(), yearStart) === year) ? 'true' : undefined}
          onKeyDown={onPickerKeyDown} onClick={() => { pendingFocus.current = true; setMonth(calendarDate(year, month.getMonth(), 1)); setView('months'); }}>{year}년</button>)}
      </>}
    </div>}
    <div className="calla-calendar-footer"><span>{selected ? `${selected.getMonth() + 1}월 ${selected.getDate()}일 선택됨` : '날짜를 선택해 주세요'}</span><button type="button" aria-label="오늘 날짜 선택" onClick={() => onSelect(today)}>오늘</button></div>
  </div>;
}

function indexFallbackYear(displayedYear: number, yearStart: number): number {
  return Math.min(yearStart + 11, Math.max(yearStart, displayedYear));
}
