import { Select } from './components/ui/Select';
import { useEffect, useRef, useState } from 'react';
import { core } from './domain';

const countries = [{ value: 'Korea', label: '대한민국' }, { value: 'China', label: '중국' }, { value: 'Japan', label: '일본' }, { value: 'USA', label: '미국' }];
const isPreset = (country: string) => countries.some(option => option.value === country);
type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; emptyLabel?: string };

export default function OriginInput({ value, onChange, disabled = false, emptyLabel = '원산지 선택' }: Props) {
  const initialCountry = core.originCountry(value);
  const [customMode, setCustomMode] = useState(!!value && !isPreset(initialCountry));
  const [country, setCountry] = useState(isPreset(initialCountry) ? '' : initialCountry);
  const [inputError, setInputError] = useState('');
  const lastValue = useRef(value);
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    const next = core.originCountry(value);
    setCustomMode(!!value && !isPreset(next));
    setCountry(isPreset(next) ? '' : next);
    setInputError('');
  }, [value]);
  const emit = (next: string) => { lastValue.current = next; onChange(next); };
  const selected = customMode ? 'custom' : core.originCountry(value);
  const issue = inputError || (customMode ? core.originIssue(value) : '');
  return <div className="origin-input">
    <Select aria-label="원산지" value={selected} disabled={disabled} onChange={event => {
      const next = event.target.value;
      setCustomMode(next === 'custom');
      setInputError('');
      emit(next === 'custom' ? `Made in ${country}` : next ? `Made in ${next}` : '');
    }}>
      <option value="">{emptyLabel}</option>
      {countries.map(option => <option key={option.value} value={option.value}>{option.label} ({option.value})</option>)}
      <option value="custom">직접 입력</option>
    </Select>
    {customMode && <input aria-label="원산지 영어 국가명" value={country} disabled={disabled} placeholder="영어 국가명 · 예: Germany" autoComplete="off" spellCheck={false} aria-invalid={!!issue} onChange={event => {
      const next = event.target.value;
      if (!/^[A-Za-z '\-]*$/.test(next)) { setInputError('나라 이름을 영어로만 입력해 주세요.'); return; }
      setInputError('');
      setCountry(next);
      emit(`Made in ${next}`);
    }}/>}
    {issue ? <span className="field-error" role="alert">{issue}</span> : value && <span className="field-hint">등록 원산지 · {core.normalizeOrigin(value)}</span>}
  </div>;
}
