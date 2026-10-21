import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { FloatingPopover } from './FloatingPopover';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
  hidden: boolean;
  selected: boolean;
  group?: string;
  groupKey?: number;
};

function textContent(nodes: ReactNode): string {
  return Children.toArray(nodes).map(node => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    return isValidElement(node) ? textContent((node as ReactElement<{ children?: ReactNode }>).props.children) : '';
  }).join('');
}

function collectOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  let groupKey = 0;
  const visit = (nodes: ReactNode, group?: string, parentDisabled = false, groupId?: number) => {
    Children.forEach(nodes, child => {
      if (!isValidElement(child)) return;
      const element = child as ReactElement<{
        value?: string | number;
        label?: string;
        disabled?: boolean;
        hidden?: boolean;
        selected?: boolean;
        children?: ReactNode;
      }>;
      if (element.type === 'option') {
        const content = textContent(element.props.children);
        options.push({
          // The browser collapses HTML whitespace for implicit option values.
          value: element.props.value === undefined ? content.replace(/[\t\n\f\r ]+/g, ' ').trim() : String(element.props.value),
          label: element.props.label ?? content,
          disabled: parentDisabled || !!element.props.disabled,
          hidden: !!element.props.hidden,
          selected: !!element.props.selected,
          group,
          groupKey: groupId,
        });
      } else if (element.type === 'optgroup') {
        visit(element.props.children, element.props.label, parentDisabled || !!element.props.disabled, groupKey++);
      } else if (element.type === Fragment) {
        visit(element.props.children, group, parentDisabled, groupId);
      }
    });
  };
  visit(children);
  return options;
}

function scalarValue(value: SelectProps['value']): string | undefined {
  return value === undefined ? undefined : String(Array.isArray(value) ? value[0] ?? '' : value);
}

// Keeps a native select behind the visual control so existing forms and native
// React change handlers receive the original option values and select element.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({
  children,
  value,
  defaultValue,
  disabled = false,
  className = '',
  style,
  id,
  onChange,
  onFocus,
  onInvalid,
  autoFocus,
  tabIndex,
  title,
  multiple,
  size,
  ...nativeProps
}, forwardedRef) {
  const generatedId = useId();
  const controlId = id || `calla-select-${generatedId}`;
  const listboxId = `${controlId}-listbox`;
  const selectRef = useRef<HTMLSelectElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const typeaheadRef = useRef({ text: '', time: 0 });
  const options = useMemo(() => collectOptions(children), [children]);
  const firstOption = options.find(option => !option.disabled && !option.hidden) || options[0];
  const [internalValue, setInternalValue] = useState(() => scalarValue(defaultValue) ?? options.find(option => option.selected)?.value ?? firstOption?.value ?? '');
  const currentValue = scalarValue(value) ?? internalValue;
  const selectedIndex = options.findIndex(option => option.value === currentValue);
  const displayedIndex = selectedIndex >= 0 ? selectedIndex : options.indexOf(firstOption!);
  const selectedOption = options[displayedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(displayedIndex);
  const [activeInput, setActiveInput] = useState<'keyboard' | 'pointer'>('keyboard');
  const enabledIndexes = options.flatMap((option, index) => option.disabled || option.hidden ? [] : [index]);
  const activeId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  useImperativeHandle(forwardedRef, () => selectRef.current!, []);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    const select = selectRef.current;
    if (!open || !select) return;
    const closeWhenLocked = () => { if (select.matches(':disabled')) setOpen(false); };
    const observer = new MutationObserver(closeWhenLocked);
    let ancestor = select.parentElement;
    // Native controls inherit disabled state from every enclosing fieldset.
    // The option rows need the same lock when a save disables an open picker.
    while (ancestor) {
      if (ancestor.tagName === 'FIELDSET') observer.observe(ancestor, { attributes: true, attributeFilter: ['disabled'] });
      ancestor = ancestor.parentElement;
    }
    closeWhenLocked();
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (!enabledIndexes.length) { setOpen(false); return; }
    if (!enabledIndexes.includes(activeIndex)) {
      setActiveIndex(enabledIndexes.includes(displayedIndex) ? displayedIndex : enabledIndexes[0]);
    }
  }, [open, options, activeIndex, displayedIndex]);
  useEffect(() => {
    const select = selectRef.current;
    const form = select?.form;
    if (!form || value !== undefined) return;
    const reset = () => {
      setInternalValue(scalarValue(defaultValue) ?? options.find(option => option.selected)?.value ?? firstOption?.value ?? '');
      setOpen(false);
    };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [value, defaultValue, options, firstOption]);

  useEffect(() => {
    if (!open || !activeId || activeInput !== 'keyboard') return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, activeId, activeInput]);

  const isDisabled = () => disabled || !!selectRef.current?.matches(':disabled');

  const changeOpen = (nextOpen: boolean) => {
    if (isDisabled() || !enabledIndexes.length) nextOpen = false;
    if (nextOpen) {
      setActiveInput('keyboard');
      setActiveIndex(enabledIndexes.includes(displayedIndex) ? displayedIndex : enabledIndexes[0] ?? -1);
    }
    typeaheadRef.current = { text: '', time: 0 };
    setOpen(nextOpen);
  };

  const choose = (index: number) => {
    const option = options[index], select = selectRef.current;
    if (!option || option.disabled || option.hidden || isDisabled() || !select) return;
    if (select.selectedIndex !== index) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    changeOpen(false);
    anchorRef.current?.focus({ preventScroll: true });
  };

  const move = (direction: 1 | -1) => {
    setActiveInput('keyboard');
    const position = enabledIndexes.indexOf(activeIndex);
    const next = position < 0 ? direction === 1 ? 0 : enabledIndexes.length - 1 : Math.max(0, Math.min(enabledIndexes.length - 1, position + direction));
    setActiveIndex(enabledIndexes[next] ?? -1);
  };

  const search = (key: string) => {
    if (isDisabled()) return;
    const now = Date.now(), previous = typeaheadRef.current;
    const text = (now - previous.time < 700 ? previous.text : '') + key.toLocaleLowerCase();
    typeaheadRef.current = { text, time: now };
    const repeated = [...text].every(character => character === text[0]);
    const query = repeated ? key.toLocaleLowerCase() : text;
    const start = open ? activeIndex : displayedIndex;
    const ordered = [...enabledIndexes.filter(index => index > start), ...enabledIndexes.filter(index => index <= start)];
    const found = ordered.find(index => options[index].label.trim().toLocaleLowerCase().startsWith(query));
    if (found === undefined) return;
    if (open) { setActiveInput('keyboard'); setActiveIndex(found); }
    else {
      const select = selectRef.current;
      if (select && select.selectedIndex !== found) {
        select.selectedIndex = found;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled() || !enabledIndexes.length || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) changeOpen(true);
      else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveInput('keyboard');
      if (!open) changeOpen(true);
      setActiveIndex(event.key === 'Home' ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1]);
    } else if (event.key === 'Enter' || (event.key === ' ' && (!typeaheadRef.current.text || Date.now() - typeaheadRef.current.time >= 700))) {
      event.preventDefault();
      if (open) choose(activeIndex);
      else changeOpen(true);
    } else if (event.key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); changeOpen(false); }
    } else if (event.key === 'Tab') {
      changeOpen(false);
    } else if (event.key.length === 1 && !event.altKey) {
      event.preventDefault();
      search(event.key);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setInternalValue(event.target.value);
    onChange?.(event);
  };

  // Preserve the native behavior if a caller explicitly requests a multi-row
  // or multiple-value control; the shared picker is a single-value combobox.
  if (multiple || (size && size > 1)) {
    return <select {...nativeProps} ref={selectRef} id={id} className={className} style={style}
      value={value} defaultValue={defaultValue} disabled={disabled} multiple={multiple} size={size}
      autoFocus={autoFocus} tabIndex={tabIndex} title={title} onChange={onChange} onFocus={onFocus} onInvalid={onInvalid}>{children}</select>;
  }

  return <div className={`calla-select ${className}`} style={style} data-state={open ? 'open' : 'closed'} data-disabled={disabled ? 'true' : undefined}>
    <select {...nativeProps} ref={selectRef} id={`${controlId}-native`} className="calla-select-native" aria-hidden="true"
      aria-label={undefined} aria-labelledby={undefined} aria-describedby={undefined} tabIndex={-1}
      value={selectedOption?.value ?? ''} disabled={disabled} onChange={handleChange}
      onFocus={event => { anchorRef.current?.focus({ preventScroll: true }); onFocus?.(event); }}
      onInvalid={event => { onInvalid?.(event); event.preventDefault(); anchorRef.current?.focus({ preventScroll: true }); }}>{children}</select>
    <button ref={anchorRef} id={controlId} type="button" role="combobox" data-value={selectedOption?.value ?? ''} className="calla-select-trigger" disabled={disabled}
      autoFocus={autoFocus} tabIndex={tabIndex} title={title ?? selectedOption?.label}
      aria-haspopup="listbox" aria-controls={listboxId} aria-expanded={open} aria-activedescendant={open ? activeId : undefined}
      aria-label={nativeProps['aria-label']} aria-labelledby={nativeProps['aria-labelledby']} aria-describedby={nativeProps['aria-describedby']}
      aria-invalid={nativeProps['aria-invalid']} aria-errormessage={nativeProps['aria-errormessage']} aria-required={nativeProps.required || nativeProps['aria-required']}
      onClick={() => changeOpen(!open)} onKeyDown={handleKeyDown}>
      <span className="calla-select-value">{selectedOption?.label || '선택하세요'}</span>
      <svg className="calla-select-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <FloatingPopover open={open} onOpenChange={changeOpen} anchorRef={anchorRef} id={listboxId} role="listbox"
      aria-labelledby={controlId} className="calla-select-menu" style={{ width: 'max-content', minWidth: 'var(--floating-anchor-width, 160px)', maxWidth: 'min(480px, calc(100vw - 16px))' } as CSSProperties}>
      {options.map((option, index) => option.hidden ? null : <Fragment key={`${option.value}-${index}`}>
        {option.group && (index === 0 || options[index - 1].groupKey !== option.groupKey) && <div className="calla-select-group" role="presentation">{option.group}</div>}
        <div id={`${listboxId}-option-${index}`} role="option" data-value={option.value} aria-selected={index === displayedIndex} aria-disabled={option.disabled || undefined}
          aria-label={option.label || '선택 안 함'} className="calla-select-option" data-active={index === activeIndex ? 'true' : undefined}
          style={{ '--option-delay': `${Math.min(index * 12, 72)}ms` } as CSSProperties}
          onPointerMove={event => {
            if (event.pointerType !== 'mouse' || option.disabled) return;
            // A hovered row is already under the pointer. Scrolling it into
            // view would pull partly visible rows back during wheel scrolling.
            setActiveInput('pointer'); setActiveIndex(index);
          }}
          onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
          <span className="calla-select-option-label">{option.label || '선택 안 함'}</span>
          {index === displayedIndex && <svg className="calla-select-check" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4.5 10 3.5 3.5 7.5-7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
      </Fragment>)}
    </FloatingPopover>
  </div>;
});

export default Select;
