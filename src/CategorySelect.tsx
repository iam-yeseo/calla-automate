import { Select } from './components/ui/Select';
import { categoryLevels } from './categories';
import { core } from './domain';
import type { Category } from './types';
import { Field } from './ui';

export default function CategorySelect({ categories, value, onChange, label, disabled = false, emptyLabel = '1차 카테고리 선택' }: {
  categories: Category[]; value: string; onChange: (code: string) => void;
  label: string; disabled?: boolean; emptyLabel?: string;
}) {
  const levels = categoryLevels(categories, value);
  const missing = !!value && !categories.some(c => c.code === value);
  return <fieldset className="category-picker form-fieldset" disabled={disabled}>
    <legend className="field-label">{label}</legend>
    <div className="form-grid category-selects">
      {levels.map((level, index) => <Field key={index} label={`${label} ${index + 1}차`}>
        <Select value={level.value} disabled={disabled || (index > 0 && !level.options.length)}
          onChange={event => onChange(event.target.value || level.parentCode)}>
          <option value="">{index === 0 ? emptyLabel : !level.parentCode ? '1차 카테고리를 먼저 선택하세요' : !level.options.length ? '하위 카테고리 없음' : `${index + 1}차 선택 안 함`}</option>
          {level.options.map(category => <option key={category.code} value={category.code} disabled={category.active === false}>
            {category.name} · {category.code}{category.active === false ? ' (사용 중지)' : ''}
          </option>)}
        </Select>
      </Field>)}
    </div>
    <p className={'category-selection field-hint' + (missing ? ' error' : '')}>
      {missing ? `저장된 코드 ${value}가 현재 목록에 없습니다. 새 분류를 선택하기 전까지 기존 코드를 유지합니다.`
        : value ? `선택: ${core.path(categories, value)} · ${value}` : '1차 카테고리를 선택하면 해당 하위 분류만 표시됩니다.'}
    </p>
  </fieldset>;
}
