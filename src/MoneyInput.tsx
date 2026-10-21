import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
import { parsePrice } from './domain';

export function formatMoneyInput(value: number | null | undefined) { return value == null ? '' : value.toLocaleString('ko-KR'); }
export default function MoneyInput({ value, onChange, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: number | null; onChange(value: number | null): void }) {
  const input = useRef<HTMLInputElement>(null), caret = useRef<number | null>(null);
  const formatted = formatMoneyInput(value);
  useLayoutEffect(() => {
    if (caret.current === null || !input.current || document.activeElement !== input.current) return;
    let index = 0, digits = 0;
    while (index < formatted.length && digits < caret.current) { if (/\d/.test(formatted[index])) digits++; index++; }
    input.current.setSelectionRange(index, index); caret.current = null;
  }, [formatted]);
  return <input {...props} ref={input} className={`money-input ${className}`} type="text" inputMode="numeric" value={formatted} onChange={event => {
    const text = event.currentTarget.value;
    if (!/^[\d,\s]*$/.test(text)) return;
    try {
      const parsed = parsePrice(text);
      caret.current = text.slice(0, event.currentTarget.selectionStart ?? text.length).replace(/\D/g, '').length;
      onChange(parsed);
    } catch { /* Keep the prior exact integer if input exceeds the safe price range. */ }
  }} />;
}
