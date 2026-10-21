import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type ReactElement,
} from 'react';
import { desktop } from './desktop';
import { DateInput } from './DateInput';
import { Select } from './components/ui/Select';
import MoneyInput from './MoneyInput';
import { createPortal } from 'react-dom';

export type IconName = 'search' | 'bell' | 'settings' | 'box' | 'sidebar' | 'list' | 'bolt' | 'photo' | 'sync' | 'chevron' | 'close' | 'check' | 'play' | 'plus' | 'warning' | 'clock' | 'info' | 'navSearch';

// Exact exported assets and slots recorded in design/web-context/assets.json.
// The SVGs retain their intrinsic Figma dimensions; wrappers never stretch them.
const iconAssets: Partial<Record<IconName, string>> = {
  info: '/assets/figma-050/067c8.svg',
  navSearch: '/assets/figma-050/34b56.svg',
  search: '/assets/figma-050/d00ba.svg',
  bell: '/assets/figma/requests-ed0d3.svg',
  settings: '/assets/figma-050/9c74c.svg',
  box: '/assets/figma-050/faeb7.svg',
  sidebar: '/assets/figma-050/01bb8.svg',
  list: '/assets/figma-050/3ca63.svg',
  bolt: '/assets/figma-050/0872f.svg',
  photo: '/assets/figma-050/59b46.svg',
  sync: '/assets/figma-050/85dfd.svg',
  chevron: '/assets/figma/requests-e9f07.svg',
  close: '/assets/figma/basic-a16fa.svg',
  check: '/assets/figma/basic-42857.svg',
  clock: '/assets/figma/progress-a1005.svg',
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const src = iconAssets[name];
  return src ? <span className={`icon icon-${name} ${className}`} aria-hidden="true"><img src={src} alt="" draggable={false} /></span> : null;
}

export function Logo({ className = '' }: { className?: string }) {
  return <img className={`calla-logo ${className}`} src="/assets/figma-050/fc341.svg" alt="calla" draggable={false} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', className = '', type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={`button ${variant} ${className}`} {...props} />;
});

const stateLabels: Record<string, string> = {
  pending: '등록 대기', queued: '등록 대기', running: '진행 중', success: '작업 완료', completed: '작업 완료',
  failed: '등록 실패', warning: '확인 필요', paused: '일시 중지', cancelled: '중단됨', review: '검토 중', disconnected: '연결 필요',
};
export function Badge({ state, children }: { state: string; children?: ReactNode }) {
  const normalized = state.toLowerCase();
  const tone = ({ completed: 'success', queued: 'pending', disconnected: 'warning', review: 'running', cancelled: 'pending', paused: 'warning' } as Record<string, string>)[normalized] || normalized;
  return <span className={`badge ${tone}`}><span className="badge-symbol" aria-hidden="true">{({success:'✓', warning:'⚠', failed:'!', running:'↻', pending:'–'} as Record<string,string>)[tone] || '–'}</span>{children ?? stateLabels[normalized] ?? state}</span>;
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  const id = useId();
  let controlId: string | undefined;
  const associate = (nodes: ReactNode): ReactNode => Children.map(nodes, child => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{ id?: string; type?: string; children?: ReactNode; 'aria-describedby'?: string }>;
    if (!controlId && (element.type === DateInput || element.type === MoneyInput || element.type === Select || ['input', 'select', 'textarea'].includes(String(element.type))) && !['checkbox', 'radio'].includes(element.props.type || '')) {
      controlId = element.props.id || `${id}-input`;
      return cloneElement(element, { id: controlId, 'aria-describedby': hint ? [element.props['aria-describedby'], `${id}-hint`].filter(Boolean).join(' ') : element.props['aria-describedby'] });
    }
    if (['div', 'span'].includes(String(element.type)) && element.props.children) return cloneElement(element, {}, associate(element.props.children));
    return child;
  });
  const content = associate(children);
  return <div className="field" role={controlId ? undefined : 'group'} aria-labelledby={controlId ? undefined : `${id}-label`}>
    {controlId ? <label className="field-label" htmlFor={controlId}>{label}</label> : <span className="field-label" id={`${id}-label`}>{label}</span>}
    {content}{hint && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
  </div>;
}

export function PageTitle({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <div className="page-title-row"><div className="page-title-copy"><h1 className="page-title">{title}</h1>{description && <p className="subtitle">{description}</p>}</div>{actions && <div className="page-title-actions">{actions}</div>}</div>;
}

export function PageFooter({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.getElementById('workspace-footer')); }, []);
  return host ? createPortal(<div className="page-footer">{children}</div>, host) : null;
}

export const Search = forwardRef<HTMLInputElement, { value: string; onChange: (value: string) => void; placeholder?: string }>(function Search({ value, onChange, placeholder = '검색어를 입력하세요' }, ref) {
  return <label className="search"><Icon name="search" /><input ref={ref} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" /></label>;
});

export function Stat({ label, value, note, icon }: { label: ReactNode; value: ReactNode; note?: ReactNode; icon?: ReactNode }) {
  const visual = icon === 'box' ? undefined : typeof icon === 'string' && icon in iconAssets ? <Icon name={icon as IconName} /> : icon;
  return <div className="stat-card"><p className="stat-label">{label}</p><div className="stat-value-row"><strong className="stat-value">{value}</strong>{visual ?? <span className="icon" aria-hidden="true"><img src="/assets/figma/requests-2102e.svg" alt="" /></span>}</div>{note && <p className="stat-note">{note}</p>}</div>;
}

export function Empty({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="box" /></span><h2>{title}</h2>{description && <p>{description}</p>}{action && <div className="empty-actions">{action}</div>}</div>;
}

const ModalContext = createContext<{ requestClose: () => void; dismissible: boolean; closing: boolean } | null>(null);

export const ModalCloseButton = forwardRef<HTMLButtonElement, ButtonProps>(function ModalCloseButton({ onClick, disabled, ...props }, ref) {
  const modal = useContext(ModalContext);
  return <Button {...props} ref={ref} disabled={disabled || !modal || !modal.dismissible || modal.closing} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented) modal?.requestClose();
  }} />;
});

const MODAL_EXIT_MS = 160;

export function Modal({ title, subtitle, children, footer, onClose, width = 800, dismissible = true, confirmClose = false, icon = 'box', className = '' }: {
  title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: number; dismissible?: boolean; confirmClose?: boolean; icon?: IconName; className?: string;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const confirmCloseRef = useRef(confirmClose);
  const closingRef = useRef(false);
  const mountedRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;
  confirmCloseRef.current = confirmClose;
  const close = useCallback(() => {
    if (!mountedRef.current || !dismissibleRef.current || closingRef.current) return;
    closingRef.current = true;
    const finish = () => {
      closeTimer.current = null;
      if (!mountedRef.current) return;
      // A request that started before a save must not dismiss the saving dialog.
      if (!dismissibleRef.current) { closingRef.current = false; setClosing(false); return; }
      onCloseRef.current();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    setClosing(true);
    closeTimer.current = setTimeout(finish, MODAL_EXIT_MS);
  }, []);
  const requestClose = useCallback(() => {
    if (!mountedRef.current || !dismissibleRef.current || closingRef.current) return;
    if (confirmCloseRef.current) setConfirmingClose(true);
    else close();
  }, [close]);
  useEffect(() => {
    mountedRef.current = true;
    closingRef.current = false;
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      mountedRef.current = false;
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <><ModalContext.Provider value={{ requestClose, dismissible, closing }}><dialog ref={dialogRef} className={`modal ${className}`} data-state={closing ? 'closing' : 'open'} style={{ '--modal-width': `${width}px`, '--modal-exit-duration': `${MODAL_EXIT_MS}ms` } as CSSProperties}
    aria-labelledby={`${id}-title`} aria-describedby={subtitle ? `${id}-description` : undefined}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); requestClose(); }}
    onPointerDown={event => {
      if (!dismissible || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose();
    }}>
    <div className="modal-header"><div className="modal-heading"><span className="modal-heading-icon" aria-hidden="true"><Icon name={icon} /></span><div className="modal-heading-copy"><h2 id={`${id}-title`}>{title}</h2>{subtitle && <p id={`${id}-description`} className="subtitle">{subtitle}</p>}</div></div>{dismissible && <button type="button" className="icon-button modal-close" aria-label="닫기" disabled={closing} onClick={requestClose}><Icon name="close" /></button>}</div>
    <div className="modal-body" inert={closing}>{children}</div>
    {footer && <div className="modal-footer" inert={closing}>{footer}</div>}
  </dialog></ModalContext.Provider>{confirmingClose && <Modal title="편집을 취소할까요?" icon="warning" width={460} dismissible={dismissible} onClose={() => setConfirmingClose(false)} footer={<><ModalCloseButton autoFocus>계속 편집</ModalCloseButton><Button variant="danger" disabled={!dismissible} onClick={() => { setConfirmingClose(false); close(); }}>편집 취소</Button></>}><p>반영하지 않은 변경사항은 사라집니다. 편집을 취소하고 닫을까요?</p></Modal>}</>;
}

const SIDEBAR_KEY = 'calla.sidebar.v1';
const SIDEBAR_DEFAULT = 260;
const clampSidebar = (value: number) => Math.max(180, Math.min(400, value));
function readSidebar() {
  try {
    const value = JSON.parse(localStorage.getItem(SIDEBAR_KEY) || 'null');
    return { width: typeof value?.width === 'number' && Number.isFinite(value.width) ? clampSidebar(value.width) : SIDEBAR_DEFAULT, collapsed: value?.collapsed === true };
  } catch { return { width: SIDEBAR_DEFAULT, collapsed: false }; }
}
function useMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

type ShellProps = {
  page: string; title: string; section?: string; user: { email: string; username?: string; name?: string; role: 'admin' | 'viewer' }; count: number;
  onNavigate: (page: string) => void; onSearch: (query: string) => void; onLogout: () => void;
  actions?: ReactNode; mallStatus?: ReactNode; children: ReactNode; demo?: boolean;
};
const navGroups = [{ id: 'product', label: '상품 등록' }, { id: 'catalog', label: '상품 조회 및 수정' }, { id: 'registration', label: '등록 설정' }, { id: 'general', label: '일반 설정' }] as const;
const navItems: { page: string; label: string; icon: IconName; group: (typeof navGroups)[number]['id']; adminOnly?: boolean }[] = [
  { page: 'requests', label: '등록 요청 상품', icon: 'list', group: 'product' },
  { page: 'automation', label: '자동 상품 등록', icon: 'bolt', group: 'product' },
  { page: 'goods', label: '상품 조회', icon: 'navSearch', group: 'catalog' },
  { page: 'catalog', label: '상품 인덱싱', icon: 'box', group: 'catalog' },
  { page: 'categories', label: '카테고리와 브랜드', icon: 'list', group: 'registration' },
  { page: 'folders', label: '서버 이미지 폴더', icon: 'photo', group: 'registration' },
  { page: 'sync', label: '동기화', icon: 'sync', group: 'registration' },
  { page: 'admin', label: '사용자 계정 관리', icon: 'settings', group: 'general', adminOnly: true },
];

export function Shell({ page, title, section = '상품 등록', user, count, onNavigate, onSearch, onLogout, actions, children, demo, mallStatus }: ShellProps) {
  const [sidebar, setSidebar] = useState(readSidebar);
  const [compact, setCompact] = useState(() => !!desktop && window.innerWidth <= 1280);
  const [compactExpanded, setCompactExpanded] = useState(false);
  useEffect(() => { const mq = window.matchMedia('(max-width: 1280px)'); const change = () => setCompact(!!desktop && mq.matches); mq.addEventListener('change', change); return () => mq.removeEventListener('change', change); }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const mobile = useMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const collapsed = (sidebar.collapsed || (compact && !compactExpanded)) && !mobile;
  const selectedPage = page === 'detail' || page === 'products' || page === 'list' ? 'requests' : page;
  const accountId = user.username || user.email;
  const username = user.name || accountId || '사용자';
  const role = user.role === 'admin' ? '상품 운영 관리자' : '상품 조회';
  useEffect(() => {
    const content = contentRef.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!content || preference.matches || typeof content.animate !== 'function') return;
    const animation = content.animate([
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
    const reduceMotion = () => { if (preference.matches) animation.cancel(); };
    preference.addEventListener('change', reduceMotion);
    return () => { animation.cancel(); preference.removeEventListener('change', reduceMotion); };
  }, [page, title]);
  useEffect(() => { try { localStorage.setItem(SIDEBAR_KEY, JSON.stringify(sidebar)); } catch { /* Session layout still works when storage is unavailable. */ } }, [sidebar]);
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); document.querySelector<HTMLInputElement>('.workspace-content .search input')?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (!mobile || !mobileOpen) return;
    const node = sidebarRef.current;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.querySelector<HTMLButtonElement>('button')?.focus();
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileOpen(false); return; }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"], summary')].filter(el => el.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, [mobile, mobileOpen]);
  useEffect(() => { if (!mobile) setMobileOpen(false); }, [mobile]);
  const navigate = (target: string) => { onNavigate(target); setMobileOpen(false); };
  const toggleSidebar = () => { if (mobile) setMobileOpen(open => !open); else if (compact) { setCompactExpanded(collapsed); setSidebar(value => ({ ...value, collapsed: false })); } else setSidebar(value => ({ ...value, collapsed: !value.collapsed })); };
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || collapsed || mobile) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: sidebar.width }; setResizing(true);
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setSidebar(value => ({ ...value, width: clampSidebar(drag.current!.width + event.clientX - drag.current!.x) }));
  };
  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null; setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboardResize = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const next = event.key === 'Home' ? 180 : event.key === 'End' ? 400 : event.key === 'ArrowLeft' ? sidebar.width - step : event.key === 'ArrowRight' ? sidebar.width + step : null;
    if (next !== null) { event.preventDefault(); setSidebar(value => ({ ...value, width: clampSidebar(next) })); }
  };
  const renderNav = (item: (typeof navItems)[number]) => {
    const active = selectedPage === item.page;
    return <button type="button" className={`sidebar-item ${active ? 'active' : ''}`} key={item.page}
      aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined} onClick={() => navigate(item.page)}>
      {item.page === 'requests' && active ? <span className="icon" aria-hidden="true"><img src="/assets/figma-050/7ca0c.svg" alt="" /></span> : <Icon name={item.icon} />}
      <span className="sidebar-label">{item.label}</span>

    </button>;
  };
  const shellStyle = { '--sidebar-width': `${collapsed ? 60 : sidebar.width}px` } as CSSProperties;
  return <div className={`app-shell ${collapsed ? 'is-collapsed' : ''} ${resizing ? 'is-resizing' : ''} ${mobileOpen ? 'mobile-nav-open' : ''}`} style={shellStyle}>
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <header className="app-header" inert={mobile && mobileOpen}>
      <div className="brand-area"><button ref={mobileToggleRef} type="button" className="icon-button mobile-menu-toggle" onClick={toggleSidebar} aria-label="메뉴 열기" aria-expanded={mobileOpen} aria-controls="app-sidebar"><Icon name="sidebar" /></button><button type="button" className="brand-link" onClick={() => navigate('requests')} aria-label="calla 상품 등록 홈"><Logo /><span>AUTOMATE</span></button></div>
      <span className="header-context">고도몰 상품 운영</span>
      <div className="header-actions">{mallStatus}{demo && <span className="demo-badge">데모</span>}<span className="header-user" title={accountId}>{username}</span><span className="header-role">{user.role === 'admin' ? '관리자' : '조회자'}</span>

        <button type="button" className="icon-button" onClick={() => navigate('sync')} aria-label="환경 설정"><Icon name="settings" /></button>
      </div>
    </header>
    {mobileOpen && <button type="button" className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="메뉴 닫기" tabIndex={-1} />}
    <aside ref={sidebarRef} id="app-sidebar" className="app-sidebar" aria-label="주 메뉴" inert={mobile && !mobileOpen}>

      <button type="button" className="workspace-toggle" onClick={toggleSidebar} aria-label={collapsed ? '사이드 메뉴 펼치기' : '사이드 메뉴 접기'} aria-expanded={!collapsed} title={collapsed ? '사이드 메뉴 펼치기' : '사이드 메뉴 접기'}>
        <Icon name="sidebar" />
      </button>
      <nav className="sidebar-nav" aria-label="상품 운영 메뉴">{navGroups.map(group => {
        const items = navItems.filter(item => item.group === group.id && (!item.adminOnly || user.role === 'admin'));
        return items.length ? <div className="sidebar-section" key={group.id}><p className="sidebar-heading">{group.label}</p>{items.map(renderNav)}</div> : null;
      })}</nav>
      <div className="sidebar-footer">
        <details className="profile-menu"><summary className="profile-summary" aria-label={`${username} 계정 메뉴`} title={collapsed ? `${username} 계정 메뉴` : undefined}><span className="avatar">{username.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong title={accountId}>{username}</strong><small>{role}</small></span><span className="profile-chevron" aria-hidden="true"><img src="/assets/figma/requests-3f384.svg" alt="" /></span></summary><div className="profile-panel"><p title={accountId}>{accountId}</p><button type="button" onClick={onLogout}>로그아웃</button></div></details>
      </div>
      {!collapsed && <div className="sidebar-resizer" role="separator" aria-label="사이드바 너비 조절" aria-orientation="vertical" aria-valuemin={180} aria-valuemax={400} aria-valuenow={sidebar.width} tabIndex={mobile ? -1 : 0} onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={stopResize} onPointerCancel={stopResize} onDoubleClick={() => setSidebar(value => ({ ...value, width: SIDEBAR_DEFAULT }))} onKeyDown={keyboardResize} />}
    </aside>
    <main className="workspace" id="main-content" tabIndex={-1} inert={mobile && mobileOpen}>
      <div className="breadcrumb-bar"><nav className="breadcrumbs" aria-label="현재 위치"><span>{navItems.find(item => item.page === selectedPage)?.label || section}</span><span className="breadcrumb-separator" aria-hidden="true">/</span><span aria-current="page">{title}</span></nav>{actions && <div className="breadcrumb-actions">{actions}</div>}</div>
      <div ref={contentRef} className="workspace-content" data-page={page}>{children}</div>
      <div id="workspace-footer" />
    </main>
  </div>;
}
