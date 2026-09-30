import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Icon, type IconName } from './ui';

type TabItem = { value: string; label: ReactNode; icon?: IconName };
export function SegmentedTabs({ id, label, value, tabs, onChange }: {
  id: string; label: string; value: string; tabs: TabItem[]; onChange: (value: string) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, tabs.findIndex(tab => tab.value === value));
  return <div className="modal-tabs" role="tablist" aria-label={label}
    style={{ '--tab-count': tabs.length, '--tab-index': selected } as CSSProperties}>
    <span className="tab-indicator" aria-hidden="true" />
    {tabs.map((tab, index) => <button key={tab.value} ref={node => { buttons.current[index] = node; }} type="button"
      className="tab" role="tab" id={`${id}-tab-${tab.value}`} aria-controls={`${id}-panel-${tab.value}`}
      aria-selected={value === tab.value} tabIndex={value === tab.value ? 0 : -1}
      onClick={() => onChange(tab.value)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); onChange(tabs[next].value); buttons.current[next]?.focus();
      }}>{tab.icon && <Icon name={tab.icon} />}<span>{tab.label}</span></button>)}
  </div>;
}

export function ModalSection({ title, description, icon, children }: {
  title: string; description?: string; icon?: IconName; children: ReactNode;
}) {
  const id = useId();
  return <section className="modal-section" aria-labelledby={id}>
    <div className="modal-section-heading">{icon && <span className="modal-section-icon"><Icon name={icon} /></span>}
      <div><h3 id={id}>{title}</h3>{description && <p className="modal-section-description">{description}</p>}</div>
    </div><div className="form-stack">{children}</div>
  </section>;
}

export function FileDropzone({ file, onFile, onClear, accept, title, description, hint, disabled = false, icon = 'photo', children }: {
  file?: File; onFile: (file: File) => void; onClear?: () => void; accept: string; title: string;
  description: string; hint?: string; disabled?: boolean; icon?: IconName; children?: ReactNode;
}) {
  const [dragging, setDragging] = useState(false), [error, setError] = useState('');
  const depth = useRef(0), id = useId();
  return <div className="upload-group">
    <div className="dropzone upload-dropzone" data-dragging={dragging && !disabled} aria-disabled={disabled || undefined}
      onDragEnter={event => { event.preventDefault(); if (disabled || !Array.from(event.dataTransfer.types).includes('Files')) return; depth.current++; setDragging(true); }}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
      onDragLeave={event => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
      onDrop={event => {
        event.preventDefault(); depth.current = 0; setDragging(false); if (disabled) return;
        const files = Array.from(event.dataTransfer.files);
        if (files.length !== 1) { setError('파일을 한 개씩 선택해 주세요.'); return; }
        setError(''); onFile(files[0]);
      }}>
      <span className="upload-icon"><Icon name={icon} /></span>
      <div><strong>{dragging ? '여기에 놓아 주세요' : title}</strong><p className="muted" id={`${id}-description`}>{description}</p></div>
      <div className="inline upload-actions"><label className={`button secondary file-button ${disabled ? 'is-disabled' : ''}`}>
        {file ? '다른 파일 선택' : '파일 선택'}<input type="file" accept={accept} disabled={disabled}
          aria-label={title} aria-describedby={`${id}-description`} onChange={event => {
            const selected = event.target.files?.[0]; event.target.value = ''; if (selected) { setError(''); onFile(selected); }
          }} /></label>{children}</div>
    </div>
    {file && <div className="upload-file-card" role="status"><span className="upload-file-icon"><Icon name="check" /></span>
      <div><strong>{file.name}</strong><small>{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}{hint ? ` · ${hint}` : ''}</small></div>
      {onClear && <Button variant="ghost" disabled={disabled} aria-label="선택한 파일 제거" onClick={onClear}><Icon name="close" /></Button>}
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}
