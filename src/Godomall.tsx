import { PREVIEW_CSP } from './preview-csp';
import { Select } from './components/ui/Select';
import { Toggle } from './components/ui/Toggle';
import { goodsRegularPrice, goodsStock } from './goods-display';
import './goods-update.css';
import MoneyInput from './MoneyInput';
import OriginInput from './OriginInput';
import RegistrationDefaults from './RegistrationDefaults';
import ProductRegistrationPreview from './ProductRegistrationPreview';
import PreviewProductEditor from './PreviewProductEditor';
import { loadPreviewProduct, savePreviewProduct } from './preview-product-edit';
import { mallBrands, resolveBrand } from './mall-settings';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './operations-redesign.css';
import './editor-redesign.css';
import { ModalSection, SegmentedTabs } from './interaction';
import { api, DEMO, post } from './api';
import { core, money } from './domain';
import type { Channel, Product, ProductList, Registration, Settings } from './types';
import { ACTION_LABELS, EDIT_FIELDS, MALLS, OPERATION_LABELS, productUrl, type GodomallOperation, type GoodsPage, type MallCode, type RemoteGoods } from './godomall-types';
import { Badge, Button, Empty, Field, Modal, ModalCloseButton, PageTitle, PageFooter } from './ui';

export function OperationNotice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'warning' }) {
  return <div className={`operations-notice ${tone}`}><span className="operations-info-icon" aria-hidden="true"><img src="/assets/figma/redesign-050/info-circle.svg" alt="" /></span><div>{children}</div></div>;
}

const stamp = (time?: string | null) => time ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(time)).replace(/\. /g, '/').replace(/\.$/, '') : '미확인';
const flag = (value: string | null, yes: string, no: string) => value === 'y' ? yes : value === 'n' ? no : '미확인';
const visualState = (op: GodomallOperation) => op.state === 'success' ? 'success' : op.state === 'failed' || op.state === 'needs_review' ? 'warning' : op.state === 'prepared' ? 'pending' : 'running';
function MallPicker({ value, onChange, disabled = false }: { value: Channel; onChange(mall: Channel): void; disabled?: boolean }) {
  return <div className="segmented godomall-mall-picker" aria-label="쇼핑몰 선택">{(['retail', 'wholesale'] as const).map(m => <button key={m} type="button" disabled={disabled} aria-pressed={m === value} className={m === value ? 'active' : ''} onClick={() => onChange(m)}>{MALLS[m].name}</button>)}</div>;
}
function SafeValue({ value }: { value: string | null }) { return value === null ? <span className="muted">—</span> : <pre className="godomall-value">{value === '' ? '(빈 값)' : value}</pre>; }

export function OperationDialog({ initial, admin, onClose, onChanged, onDraftSaved, allowExecute = true }: { initial: GodomallOperation; admin: boolean; allowExecute?: boolean; onClose(): void; onChanged?(op: GodomallOperation): void; onDraftSaved?(product: Product): void }) {
  const [op, setOp] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false), [attempted, setAttempted] = useState(false);
  const [editingPreview, setEditingPreview] = useState<Product | null>(null), [editorSettings, setEditorSettings] = useState<Settings | null>(null), [previewStale, setPreviewStale] = useState(false), [draftSaved, setDraftSaved] = useState(false);
  const lock = useRef(false), responseVersion = useRef(0);
  const path = `/godomall/${op.mall_id}/operations/${op.id}`;
  const draftOnly = !allowExecute || attempted || op.state !== 'prepared';
  useEffect(() => {
    if (initial.kind !== 'insert' || initial.product_preview) return;
    const controller = new AbortController(), version = ++responseVersion.current;
    void api<{ operation: GodomallOperation }>(path, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && version === responseVersion.current) setOp(result.operation);
    }).catch(e => { if (!controller.signal.aborted && version === responseVersion.current) setError(e.message); });
    return () => controller.abort();
  }, [path]);
  const act = async (action: 'execute' | 'verify' | 'read') => {
    if (lock.current || editingPreview || action === 'execute' && (previewStale || !confirmed || attempted || op.state !== 'prepared')) return; lock.current = true; setBusy(true); setError('');
    // An older background history read must not overwrite a later action.
    responseVersion.current++;
    if (action === 'execute') setAttempted(true);
    try { const result = action === 'read' ? await api<{ operation: GodomallOperation }>(path) : await post<{ operation: GodomallOperation }>(`${path}/${action}`, { confirmed: action === 'execute' }); setOp(result.operation); onChanged?.(result.operation); }
    catch (e) { setError(`${(e as Error).message}${action === 'execute' ? ' 실행 요청은 반복하지 않습니다. 아래에서 작업 상태를 다시 조회해 주세요.' : ''}`); }
    finally { lock.current = false; setBusy(false); }
  };
  const editPreview = async () => {
    if (lock.current || !admin || !op.item_id || op.kind !== 'insert') return;
    lock.current = true; setBusy(true); setConfirmed(false); setError('');
    responseVersion.current++;
    try {
      const [product, configuration] = await Promise.all([loadPreviewProduct(op.item_id), api<{ value: Settings }>('/settings')]);
      setEditorSettings(configuration.value); setEditingPreview(product);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const savePreview = async (product: Product, file?: File) => {
    if (lock.current || !editingPreview || !editorSettings) return;
    lock.current = true; setBusy(true); setConfirmed(false); setError(''); setDraftSaved(false);
    // The old immutable operation may no longer match the saved draft, even
    // when a save response is lost. It cannot be executed after this point.
    setPreviewStale(true); responseVersion.current++;
    try {
      const saved = await savePreviewProduct(product, file);
      const original = editingPreview;
      setEditingPreview(saved);
      onDraftSaved?.(saved);
      if (draftOnly) { setEditingPreview(null); setDraftSaved(true); return; }
      const brandChanged = saved.brand !== original.brand || saved.automation.brandCodes?.[op.mall_id] !== original.automation.brandCodes?.[op.mall_id];
      const brand = brandChanged ? resolveBrand(saved, editorSettings, op.mall_id) : op.changes.find(change => change.field === 'brandCd')?.after || '';
      const result = await post<{ operation: GodomallOperation }>(`/godomall/${op.mall_id}/operations/prepare`, { kind: 'insert', itemId: saved.id, choices: { brandCd: brand, scmNo: '1' } });
      setOp(result.operation); setPreviewStale(false); setEditingPreview(null); onChanged?.(result.operation);
    } catch (e) { setError(`${(e as Error).message} 이전 미리보기로는 등록할 수 없습니다. 수정 내용을 저장하고 다시 검증해 주세요.`); }
    finally { lock.current = false; setBusy(false); }
  };
  const comparison = <div className="table-wrap godomall-diff"><table className="data-table"><thead><tr><th>항목</th><th>변경 전 · 실제 고도몰 값</th><th>{op.kind === 'insert' ? '등록할 내용' : '변경 후 · 편집안'}</th><th>비교</th></tr></thead><tbody>{op.changes.map(change => <tr key={change.field}><td>{change.label}</td><td><SafeValue value={change.before} /></td><td><SafeValue value={change.after} /></td><td><Badge state={change.before === change.after ? 'pending' : 'warning'}>{change.before === change.after ? '변경 없음' : op.kind === 'insert' ? '신규' : '변경'}</Badge></td></tr>)}</tbody></table></div>;
  return <Modal title={`${MALLS[op.mall_id].name} · ${ACTION_LABELS[op.kind]}`} subtitle={`${core.displayName(op.title)}${op.goods_no ? ` · 상품번호 ${op.goods_no}` : ''}`} onClose={onClose} dismissible={!busy} confirmClose={!!editingPreview} width={1124} footer={<>
    <div className="operations-footer-copy"><strong>{MALLS[op.mall_id].name} 상품 {ACTION_LABELS[op.kind]}{op.kind === 'insert' ? ' 미리보기' : ` · ${op.changes.length}개 항목`}</strong><small>{op.state === 'prepared' ? '내용을 확인한 뒤 실행하면 실제 상품에 반영됩니다.' : OPERATION_LABELS[op.state]}</small></div>
    <ModalCloseButton disabled={busy}>{op.state === 'prepared' && !attempted ? '취소' : '닫기'}</ModalCloseButton><Button disabled={busy || !!editingPreview} onClick={() => void act('read')}>작업 상태 다시 조회</Button>
    {admin && ['sending', 'verifying', 'needs_review'].includes(op.state) && <Button disabled={busy || !!editingPreview} onClick={() => void act('verify')}>실제 결과 다시 확인</Button>}
    {admin && allowExecute && op.kind !== 'delete' && op.state === 'prepared' && <Button variant="primary" disabled={busy || !!editingPreview || previewStale || !confirmed || attempted} onClick={() => void act('execute')}>{busy ? '요청 및 결과 확인 중…' : `${ACTION_LABELS[op.kind]} 실행`}</Button>}
  </>}>
    <div className="form-stack operations-review operations-compare">
      {error && !editingPreview && <div className="alert error" role="alert">{error}</div>}
      <div className="section-heading"><Badge state={visualState(op)}>{OPERATION_LABELS[op.state]}</Badge><small className="muted">마지막 확인 {stamp(op.checked_at)}</small></div>
      {op.error_message && <div className="alert warning">{op.error_message}</div>}
      {op.kind === 'delete' && <div className="alert warning">상품 삭제는 고도몰 관리자에서만 진행합니다. 이 앱에서는 기존 삭제 작업도 실행할 수 없습니다.</div>}
      {op.warnings.length > 0 && <details className="preview-notices"><summary>확인할 안내 {op.warnings.length}개</summary><ul>{op.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
      {op.state === 'success' && <div className="alert">{op.kind === 'delete' ? '삭제 API의 성공 응답과 상품번호가 일치함을 확인했습니다.' : '같은 몰에서 상품을 다시 조회하고 요청한 내용의 반영을 확인했습니다.'}</div>}
      {draftSaved && <OperationNotice tone="brand">리스트 초안을 저장했습니다. 이미 실행한 작업의 미리보기는 당시 전송 내용입니다. 초안을 저장해도 고도몰 상품은 변경되거나 다시 등록되지 않습니다.</OperationNotice>}
      {op.kind === 'insert' ? <>
        {editingPreview && editorSettings ? <><OperationNotice tone={draftOnly ? 'warning' : 'brand'}>{draftOnly ? '이미 실행한 작업의 미리보기는 당시 전송 내용입니다. 여기서는 연결된 리스트 초안만 수정하며 고도몰 상품은 변경되거나 다시 등록되지 않습니다.' : '상품 초안을 저장한 뒤 새 등록 미리보기를 만듭니다. 갱신된 내용을 다시 확인한 뒤 등록해 주세요.'}</OperationNotice><PreviewProductEditor key={`${editingPreview.id}:${editingPreview.updated_at}`} product={editingPreview} settings={editorSettings} mall={op.mall_id} busy={busy} error={error} applyLabel={draftOnly ? '리스트 초안 저장' : undefined} onCancel={() => { setEditingPreview(null); setError(''); }} onSave={savePreview} /></> : <>
          {previewStale && !draftOnly && <OperationNotice tone="warning">상품 정보가 바뀌어 이전 미리보기로는 등록할 수 없습니다. 등록 내용을 수정하고 저장하여 미리보기를 갱신해 주세요.</OperationNotice>}
          <ProductRegistrationPreview key={op.id} operation={op} onEdit={admin && op.item_id ? () => void editPreview() : undefined} editDisabled={busy} editLabel={draftOnly ? '연결된 상품 초안 수정' : undefined} /><details className="preview-technical"><summary>전송 항목 확인</summary>{comparison}</details>
        </>}
      </> : <><OperationNotice tone="brand">{MALLS[op.mall_id].name}의 상품에만 적용합니다.</OperationNotice>{comparison}</>}
      {allowExecute && op.kind !== 'delete' && op.state === 'prepared' && <label className="check-label"><input type="checkbox" disabled={busy || !!editingPreview || previewStale || attempted} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{MALLS[op.mall_id].name}, 상품명, {op.goods_no ? `상품번호 ${op.goods_no} 및 ` : ''}위 내용을 확인했습니다.</label>}
      {op.goods_no && op.kind !== 'delete' && <a className="table-link" href={productUrl(op.mall_id, op.goods_no)} target="_blank" rel="noreferrer">해당 쇼핑몰 상품 페이지 열기 ↗</a>}
      <small className="muted">작업번호 {op.id} · 생성 {stamp(op.created_at)} · 재조회 {op.verification_attempts}회{op.marker ? ` · 확인용 코드 ${op.marker}` : ''}</small>
    </div>
  </Modal>;
}

export function ApiRegistration({ product, onClose, onChanged, onDraftSaved }: { product: Product; onClose(): void; onChanged?(): void; onDraftSaved?(product: Product): void }) {
  const [mall, setMall] = useState<Channel>(product.need_retail === '필요' ? 'retail' : 'wholesale');
  return <ApiRegistrationForMall key={mall} product={product} mall={mall} setMall={setMall} onClose={onClose} onChanged={onChanged} onDraftSaved={onDraftSaved} />;
}
function ApiRegistrationForMall({ product, mall, setMall, onClose, onChanged, onDraftSaved }: { product: Product; mall: Channel; setMall(m: Channel): void; onClose(): void; onChanged?(): void; onDraftSaved?(product: Product): void }) {
  const [brands, setBrands] = useState<MallCode[]>([]);
  const [brand, setBrand] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [op, setOp] = useState<GodomallOperation | null>(null), [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api<{ value: Settings }>('/settings', { signal: controller.signal }).then(b => {
      if (controller.signal.aborted) return;
      setBrands(mallBrands(b.value, mall).map(row => ({ code: row.code, name: row.name, fields: {} })));
      setBrand(resolveBrand(product, b.value, mall));
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mall, product.brand, reload]);
  const prepare = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { const result = await post<{ operation: GodomallOperation }>(`/godomall/${mall}/operations/prepare`, { kind: 'insert', itemId: product.id, choices: { brandCd: brand, scmNo: '1' } }); setOp(result.operation); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  };
  if (op) return <OperationDialog initial={op} admin onClose={onClose} onChanged={() => onChanged?.()} onDraftSaved={onDraftSaved} />;
  return <Modal title="고도몰 API 상품 등록" subtitle={core.displayName(product.name_own)} onClose={onClose} dismissible={!busy} width={760} footer={<><ModalCloseButton disabled={busy}>취소</ModalCloseButton><Button variant="primary" disabled={loading || busy || DEMO} onClick={() => void prepare()}>{busy ? '몰 설정 검증 중…' : '등록할 내용 검토'}</Button></>}>
    <div className="form-stack operations-review"><MallPicker value={mall} onChange={setMall} disabled={busy} />
      {error && <div className="alert error" role="alert">{error}<Button disabled={loading || busy} onClick={() => setReload(n => n + 1)}>설정 다시 조회</Button></div>}
      {loading && <p role="status">선택한 몰의 브랜드 설정을 조회하고 있습니다.</p>}
      <dl className="details-list"><dt>저장된 카테고리</dt><dd>{product.automation.categoryCodes[mall] || '미설정'}</dd><dt>모델번호</dt><dd>{product.model || '—'}</dd><dt>판매가</dt><dd>{money(mall === 'retail' ? product.price_retail : product.price_wholesale)}원</dd><dt>노출 · 판매</dt><dd>PC·모바일 숨김 / 판매함</dd></dl>
      <Field label="해당 몰의 브랜드"><Select value={brand} disabled={loading || busy} onChange={e => setBrand(e.target.value)}><option value="">브랜드 코드 없음</option>{brands.map(row => <option key={row.code} value={row.code}>{row.name} ({row.code})</option>)}</Select></Field>
      <RegistrationDefaults malls={[mall]} />
      {mall === 'wholesale' && product.price_wholesale_master !== null && product.price_wholesale_master !== product.price_wholesale && <div className="alert warning"><p>공식 API는 회원등급별 가격을 지원하지 않습니다. 도매 베이직 가격을 기본 판매가로 등록하며, 마스터 {money(product.price_wholesale_master)}원은 관리자에서 별도로 설정해야 합니다.</p></div>}
      <p className="muted">상품명·카테고리·이미지·상세설명은 저장된 상품에서 가져옵니다. 검토 화면에서 확인한 뒤 실행해야 실제 등록됩니다.</p>
    </div>
  </Modal>;
}

export function RegistrationSummary({ registrations, product, mall: selectedMall }: { registrations: Registration[]; product: Product; mall?: Channel }) {
  const labels: Record<string, string> = { unknown: '미확인', verifying: '결과 확인 중', verified: '등록 완료', failed: '실패', needs_review: '결과 확인 필요', deleted: '삭제상품관리로 이동' };
  return <div className="channel-results">{(selectedMall ? [selectedMall] : ['retail', 'wholesale'] as const).map(mall => {
    const r = registrations.find(reg => reg.channel === mall), state = r?.api_state || (r?.status === 'failed' ? 'failed' : r?.status === 'running' ? 'verifying' : 'unknown');
    if (state === 'verified') {
      const label = <Badge state="success">등록완료</Badge>;
      return <div className="godomall-registration" key={mall}>{r?.goods_no
        ? <a className="registration-completed-link" href={productUrl(mall, r.goods_no)} target="_blank" rel="noreferrer" title={`${MALLS[mall].name} 상품 페이지 열기 (새 창)`}>{label}</a>
        : label}</div>;
    }
    return <div className="godomall-registration" key={mall}><span className={`channel-result ${state === 'needs_review' || state === 'failed' ? 'failed' : 'pending'}`}>{MALLS[mall].name} · {state==='failed'&&r?.status==='success'?'등록됨 · 최근 작업 실패':labels[state]}{product[`need_${mall}`] !== '필요' ? ' · 등록 불필요' : ''}</span>{r?.goods_no && <a href={productUrl(mall, r.goods_no)} target="_blank" rel="noreferrer">#{r.goods_no} ↗</a>}<small className="secondary">{r?.last_action ? `${ACTION_LABELS[r.last_action]} · ` : ''}{stamp(r?.checked_at)}</small>{r?.remote_status&&<small className="secondary">PC {flag(r.remote_status.display,'노출','숨김')} · {flag(r.remote_status.sell,'판매','판매 중지')}<br/>모바일 {flag(r.remote_status.displayMobile,'노출','숨김')} · {flag(r.remote_status.sellMobile,'판매','판매 중지')}</small>}{(r?.api_error || r?.error_message) && <small className="godomall-result-error">{r.api_error || r.error_message}</small>}{r?.warnings?.map((w, i) => <small className="secondary" key={i}>{w}</small>)}</div>;
  })}</div>;
}

export default function GodomallPage({ admin, lists }: { admin: boolean; lists: ProductList[] }) {
  const initialMall = new URLSearchParams(location.search).get('mall') === 'wholesale' ? 'wholesale' : 'retail';
  const [mall, setMall] = useState<Channel>(initialMall);
  const [register, setRegister] = useState(false), [product, setProduct] = useState<Product | null>(null);
  return <div className="operations-page goods-page"><PageTitle title="상품 조회" description="고도몰의 실제 상품 정보를 조회합니다. 리스트 초안과 별도로 관리됩니다." actions={admin ? <Button variant="primary" onClick={() => setRegister(true)}>저장된 상품 등록</Button> : undefined} />
    {DEMO && <div className="alert warning">개발 미리보기에서는 고도몰에 연결하거나 상품을 전송하지 않습니다.</div>}
    <MallPicker value={mall} onChange={setMall} />
    <MallWorkspace key={mall} mall={mall} admin={admin} />
    {register && <SavedProductPicker lists={lists} onClose={() => setRegister(false)} onSelect={p => { setRegister(false); setProduct(p); }} />}
    {product && <ApiRegistration product={product} onClose={() => setProduct(null)} />}
  </div>;
}

function SavedProductPicker({ lists, onClose, onSelect }: { lists: ProductList[]; onClose(): void; onSelect(p: Product): void }) {
  const [list, setList] = useState(''), [items, setItems] = useState<Product[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => { const controller = new AbortController(); setItems([]); setError(''); if (!list) return; setLoading(true); api<{ items: Product[] }>(`/lists/${list}/items`, { signal: controller.signal }).then(data => !controller.signal.aborted && setItems(data.items.map(p => ({ ...p, automation: core.normalize(p.automation) })))).catch(e => !controller.signal.aborted && setError(e.message)).finally(() => !controller.signal.aborted && setLoading(false)); return () => controller.abort(); }, [list]);
  return <Modal title="등록할 저장 상품 선택" onClose={onClose} width={720} footer={<ModalCloseButton>닫기</ModalCloseButton>}><div className="form-stack"><Field label="상품 리스트"><Select value={list} onChange={e => setList(e.target.value)}><option value="">리스트 선택</option>{lists.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></Field>{error && <div role="alert" className="alert error">{error}</div>}{loading && <p role="status">상품을 불러오는 중…</p>}{items.map(item => <div key={item.id} className="review-item"><div><strong>{core.displayName(item.name_own)}</strong><small className="secondary">{item.brand} · {item.model}</small></div><span className="spacer" /><Button onClick={() => onSelect(item)}>선택</Button></div>)}</div></Modal>;
}

function MallWorkspace({ mall, admin }: { mall: Channel; admin: boolean }) {
  const [q, setQ] = useState(''), [field, setField] = useState('goodsNm'), [search, setSearch] = useState({ q: '', field: 'goodsNm', page: 1 }), [reload, setReload] = useState(0);
  const [data, setData] = useState<GoodsPage | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [goods, setGoods] = useState<RemoteGoods | null>(null), [detailBusy, setDetailBusy] = useState(false), [editing, setEditing] = useState(false), [op, setOp] = useState<GodomallOperation | null>(null);
  const [history, setHistory] = useState<GodomallOperation[]>([]), [historyOffset, setHistoryOffset] = useState(0), [nextHistory, setNextHistory] = useState<number | null>(null), [historyError, setHistoryError] = useState('');
  const detailVersion = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; detailVersion.current++; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setData(null);
    const params = new URLSearchParams({ ...search, page: String(search.page), size: '50' });
    api<GoodsPage>(`/godomall/${mall}/goods?${params}`, { signal: controller.signal }).then(result => !controller.signal.aborted && setData(result)).catch(e => !controller.signal.aborted && setError(e.message)).finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [mall, search, reload]);
  useEffect(() => {
    const controller = new AbortController(); setHistoryError('');
    api<{ operations: GodomallOperation[]; nextOffset: number | null }>(`/godomall/${mall}/operations?offset=${historyOffset}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setHistory(result.operations); setNextHistory(result.nextOffset); } }).catch(e => !controller.signal.aborted && setHistoryError(e.message));
    return () => controller.abort();
  }, [mall, reload, historyOffset]);
  async function select(goodsNo: string) {
    const version = ++detailVersion.current; setDetailBusy(true); setError(''); setGoods(null);
    try { const result = await api<{ goods: RemoteGoods }>(`/godomall/${mall}/goods/${goodsNo}`); if (alive.current && version === detailVersion.current) setGoods(result.goods); }
    catch (e) { if (alive.current && version === detailVersion.current) setError((e as Error).message); } finally { if (alive.current && version === detailVersion.current) setDetailBusy(false); }
  }
  const changed = (operation: GodomallOperation) => { setReload(n => n + 1); if (operation.state === 'success') { setGoods(null); setEditing(false); } };
  const unresolved = history.filter(operation => ['sending', 'verifying', 'needs_review'].includes(operation.state));
  return <div className="godomall-workspace">
    {unresolved.length > 0 && <OperationNotice tone="warning"><div className="operations-notice-actions"><span>{MALLS[mall].name}에 결과 확인이 필요한 작업이 {unresolved.length}건 있습니다.</span><Button onClick={() => setOp(unresolved[0])}>작업 결과 보기</Button></div></OperationNotice>}
    <form className="toolbar operations-goods-search" onSubmit={e => { e.preventDefault(); setGoods(null); setSearch({ q, field, page: 1 }); }}><Field label="검색 기준"><Select aria-label="검색 조건" value={field} onChange={e => setField(e.target.value)}><option value="goodsNm">상품명</option><option value="goodsNo">상품번호</option><option value="goodsModelNo">모델번호</option><option value="goodsCd">자체 상품코드</option></Select></Field><Field label="검색어"><input className="godomall-search" aria-label="고도몰 상품 검색어" placeholder={`${MALLS[mall].name} 상품 검색`} value={q} onChange={e => setQ(e.target.value)} /></Field><Button type="submit" disabled={loading}>검색</Button><Button variant="ghost" disabled={loading} onClick={() => { setQ(''); setField('goodsNm'); setGoods(null); setSearch({ q: '', field: 'goodsNm', page: 1 }); }}>초기화</Button></form>
    <small className="muted">검색 기준: 상품명 / 상품번호 / 모델명 / 자체 상품코드</small>
    {error && <div role="alert" className="alert error">{error}</div>}{loading && <p role="status">{MALLS[mall].name} 상품을 조회하고 있습니다…</p>}
    {data && <><div className="card table-wrap"><table className="data-table godomall-goods-table"><thead><tr><th>상품번호</th><th>상품 / 모델명</th>{mall === 'wholesale' ? <><th className="numeric">정가</th><th className="numeric">베이직 판매가</th><th className="numeric">마스터 판매가</th></> : <th className="numeric">판매가</th>}<th>재고</th><th>노출 / 판매</th></tr></thead><tbody>{data.goods.map(row => {
      const stock = goodsStock(row), regularPrice = goodsRegularPrice(row);
      return <tr key={`${row.mallId}:${row.goodsNo}`} className={stock.soldOut ? 'goods-sold-out-row' : undefined}><td>{row.goodsNo}</td><td><div className="godomall-product-name">{row.image && <img src={row.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}<div><button className="table-link" onClick={() => void select(row.goodsNo)}>{core.displayName(row.name || '상품명 미제공')}</button>{stock.soldOut && <span className="goods-sold-out-label">품절</span>}<small className="secondary">{row.model || '모델명 미지정'}</small></div></div></td>
        {mall === 'wholesale' && <td className="numeric">{regularPrice === null ? '미확인' : `${money(regularPrice)}원`}</td>}
        <td className="numeric">{row.price === null ? '미확인' : `${money(row.price)}원`}</td>
        {mall === 'wholesale' && <td className="numeric goods-master-price" aria-label="마스터 판매가 미연동">—</td>}
        <td>{stock.unlimited ? <span className="goods-unlimited" role="img" aria-label="무한정 판매">∞</span> : row.stock === null ? '미확인' : `${row.stock.toLocaleString('ko-KR')}개`}<small className="secondary">{flag(row.stockMode, '재고량에 따름', '무한정 판매')}{stock.soldOut ? ' · 품절' : row.soldOut === 'n' ? ' · 정상' : ''}</small></td><td><small>PC: {flag(row.display, '노출', '숨김')} · {flag(row.sell, '판매', '판매 중지')}</small><small className="secondary">모바일: {flag(row.displayMobile, '노출', '숨김')} · {flag(row.sellMobile, '판매', '판매 중지')}</small></td></tr>;
    })}</tbody></table>{!data.goods.length && <Empty title="검색 결과가 없습니다" description="이 조회 결과만으로 기존 작업의 실패나 삭제 완료를 판단하지 않습니다." />}</div><div className="pagination"><span className="muted">{data.total === null ? `${data.goods.length}개 표시` : `전체 ${data.total.toLocaleString('ko-KR')}개`} · {data.page}{data.maxPage ? ` / ${data.maxPage}` : ''}페이지</span><span className="spacer" /><Button disabled={loading || search.page <= 1} onClick={() => setSearch(s => ({ ...s, page: s.page - 1 }))}>이전</Button><Button disabled={loading || !data.hasNext} onClick={() => setSearch(s => ({ ...s, page: s.page + 1 }))}>다음</Button></div></>}
    {detailBusy && <p role="status">최신 상품 상세정보를 확인하고 있습니다…</p>}
    {goods && !editing && !op && <Modal className="product-editor-modal remote-product-modal" title="상품 상세" subtitle={`${MALLS[mall].name} · 상품번호 ${goods.goodsNo}`} onClose={() => setGoods(null)} width={800} footer={<><ModalCloseButton>닫기</ModalCloseButton><a className="button secondary" href={goods.url} target="_blank" rel="noreferrer">쇼핑몰 상품 페이지 ↗</a>{admin && <Button variant="primary" disabled={detailBusy} onClick={() => setEditing(true)}>수정</Button>}</>}>
      <div className="form-stack operations-review operations-remote-detail">
        {error && <div role="alert" className="alert error">{error}</div>}
        <p className="muted">마지막 조회 {stamp(goods.checkedAt)} · 상품 삭제는 고도몰 관리자에서만 진행합니다.</p>
        <RemotePreservationNotice issues={goods.preservationIssues} />
        <RemoteProductFields goods={goods} fields={goods.fields} />
      </div>
    </Modal>}
    {goods && editing && <RemoteEditor goods={goods} onClose={() => setEditing(false)} onPrepared={operation => { setEditing(false); setOp(operation); }} />}
    {op && <OperationDialog key={op.id} initial={op} admin={admin} onClose={() => { setOp(null); setReload(n => n + 1); }} onChanged={changed} />}
    <OperationNotice>선택한 몰의 실제 조회 값입니다. 도매 마스터 가격은 API 조회·전송 항목에 포함되지 않습니다. 원격 상품 삭제는 고도몰 관리자에서 진행합니다.</OperationNotice>
    <section className="godomall-history"><div className="section-heading"><h2>{MALLS[mall].name} 작업 이력</h2><Button onClick={() => setReload(n => n + 1)}>이력 새로고침</Button></div>{historyError && <div className="alert error" role="alert">{historyError}</div>}<div className="card table-wrap"><table className="data-table"><thead><tr><th>작업 시각</th><th>상품</th><th>작업</th><th>처리 결과</th><th>최근 확인</th></tr></thead><tbody>{history.map(operation => <tr key={operation.id}><td>{stamp(operation.created_at)}</td><td><button className="table-link" onClick={() => setOp(operation)}>{core.displayName(operation.title)}</button><small className="secondary">{operation.goods_no || '상품번호 확인 전'}</small></td><td>{ACTION_LABELS[operation.kind]}</td><td><Badge state={visualState(operation)}>{OPERATION_LABELS[operation.state]}</Badge>{operation.error_message && <small className="secondary">{operation.error_message}</small>}</td><td>{stamp(operation.checked_at)}</td></tr>)}</tbody></table>{!history.length && !historyError && <Empty title="아직 API 작업 이력이 없습니다" description="상품을 검토하거나 실행한 기록이 이곳에 저장됩니다." />}</div><div className="pagination"><span className="spacer" /><Button disabled={!historyOffset} onClick={() => setHistoryOffset(n => Math.max(0, n - 50))}>이전 이력</Button><Button disabled={nextHistory === null} onClick={() => setHistoryOffset(nextHistory || 0)}>다음 이력</Button></div></section>
    <PageFooter><div className="operations-footer-copy"><strong>선택 몰 · {MALLS[mall].name}</strong><small>최근 조회 {stamp(data?.checkedAt)}</small></div><Button disabled={loading} onClick={() => setReload(n => n + 1)}>다시 조회</Button></PageFooter>
  </div>;
}
function RemotePreservationNotice({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return <div className="alert warning remote-preservation-notice">수정할 수 있습니다. 저장 전에 다음 내용을 확인해 주세요.<ul>{issues.map(issue => <li key={issue}>{issue.startsWith('수정 필수정보 누락:') ? '일부 상품 설정이 조회되지 않았습니다. 변경 전·후 검토에서 저장 가능 여부를 확인해 주세요.' : issue.replace('(ex_title/exN)', '').replace('고도몰 수정 API', '고도몰')}</li>)}</ul></div>;
}

function RemoteProductFields({ goods, fields, onChange }: { goods: RemoteGoods; fields: Record<string, string>; onChange?(key: string, value: string): void }) {
  const tabsId = useId(), [tab, setTab] = useState('basic');
  const [settings, setSettings] = useState<Settings | null>(null), [deliveries, setDeliveries] = useState<MallCode[]>([]);
  const readonly = !onChange;
  useEffect(() => {
    const controller = new AbortController();
    void api<{ value: Settings }>('/settings', { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setSettings(result.value); }).catch(() => {});
    void api<{ codes: MallCode[] }>(`/godomall/${goods.mallId}/codes?kind=delivery`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setDeliveries(result.codes); }).catch(() => {});
    return () => controller.abort();
  }, [goods.mallId]);
  const field = (key: string, label = EDIT_FIELDS[key]) => <Field key={key} label={label}><input value={fields[key] ?? ''} readOnly={readonly} placeholder={readonly ? '미지정' : undefined} onChange={e => onChange?.(key, e.target.value)} /></Field>;
  const choice = (key: string, label: string, options: { code: string; name: string }[]) => {
    const current = fields[key] ?? '', currentOption = options.find(option => option.code === current);
    return <Field label={label}>{readonly ? <input readOnly value={currentOption?.name || current} placeholder="미지정" /> : <Select value={current} onChange={e => onChange?.(key, e.target.value)}><option value="">미지정</option>{current && !currentOption && <option value={current}>{current}</option>}{options.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}</Select>}</Field>;
  };
  const boolean = (key: string, label = EDIT_FIELDS[key]) => choice(key, label, [{ code: 'y', name: key === 'stockFl' ? '재고량에 따름' : key === 'soldOutFl' ? '품절' : key.includes('Display') ? '노출' : '판매' }, { code: 'n', name: key === 'stockFl' ? '무한정 판매' : key === 'soldOutFl' ? '정상' : key.includes('Display') ? '숨김' : '판매 중지' }]);
  const statusToggle = (key: string) => <Field key={key} label={EDIT_FIELDS[key]}><Toggle label={EDIT_FIELDS[key]} checked={fields[key] === 'y'} disabled={readonly} onChange={checked => onChange?.(key, checked ? 'y' : 'n')}>{flag(fields[key] ?? null, key.includes('Display') ? '노출' : '판매', key.includes('Display') ? '숨김' : '판매 중지')}</Toggle></Field>;
  const price = (key: string) => <Field key={key} label={EDIT_FIELDS[key]}>{readonly ? <input readOnly value={fields[key] == null || fields[key] === '' ? '' : `${money(Number(fields[key]))}원`} placeholder="미지정" /> : <MoneyInput value={fields[key] == null || fields[key] === '' ? null : Number(fields[key])} onChange={value => onChange?.(key, value === null ? '' : String(value))} />}</Field>;
  const categories = settings?.categories[goods.mallId] || [];
  return <>
    <SegmentedTabs id={tabsId} label="상품 설정" value={tab} onChange={setTab} tabs={[{ value: 'basic', label: '기본 설정' }, { value: 'images', label: '이미지 설정' }]} />
    <div className="form-stack tab-panel editor-basic-panel" role="tabpanel" id={`${tabsId}-panel-basic`} aria-labelledby={`${tabsId}-tab-basic`} hidden={tab !== 'basic'}>
      <Field label="상품명"><textarea rows={2} value={fields.goodsNm ?? goods.name ?? ''} readOnly={readonly} onChange={e => onChange?.('goodsNm', e.target.value)} /></Field>
      <div className="form-grid">{field('makerNm', '제조사')}{field('goodsModelNo', '모델명')}{readonly ? field('originNm', '원산지') : <Field label="원산지"><OriginInput value={fields.originNm ?? ''} onChange={value => onChange?.('originNm', value)} /></Field>}<Field label="상품번호"><input readOnly value={goods.goodsNo} /></Field></div>
      <ModalSection title="몰별 분류">
        <div className="form-grid">{choice('cateCd', '카테고리', categories.map(category => ({ code: category.code, name: core.path(categories, category.code) })))}{choice('brandCd', '브랜드', settings ? mallBrands(settings, goods.mallId) : [])}{choice('deliverySno', '배송비 설정', deliveries)}</div>
      </ModalSection>
      <ModalSection title="가격 · 원"><div className="form-grid">{price('fixedPrice')}{price('goodsPrice')}</div></ModalSection>
      <ModalSection title="판매 및 재고"><div className="form-grid">{boolean('stockFl')}{field('totalStock')}{boolean('soldOutFl')}</div></ModalSection>
      <ModalSection title="노출 및 판매 상태"><div className="form-grid">{statusToggle('goodsDisplayFl')}{statusToggle('goodsDisplayMobileFl')}{statusToggle('goodsSellFl')}{statusToggle('goodsSellMobileFl')}</div></ModalSection>
    </div>
    <div className="form-stack tab-panel" role="tabpanel" id={`${tabsId}-panel-images`} aria-labelledby={`${tabsId}-tab-images`} hidden={tab !== 'images'}>
      <ModalSection title="상품 썸네일">{goods.image ? <img className="remote-product-thumbnail" src={goods.image} alt="상품 썸네일" referrerPolicy="no-referrer" /> : <p className="muted">등록된 썸네일이 없습니다.</p>}</ModalSection>
      {(['goodsDescription', 'goodsDescriptionMobile'] as const).map(key => <ModalSection key={key} title={EDIT_FIELDS[key]}>
        {fields[key]?.trim() ? <iframe className="editor-html-preview" title={`${EDIT_FIELDS[key]} 미리보기`} sandbox="" referrerPolicy="no-referrer" srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>body{font:14px/1.6 sans-serif;margin:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${fields[key]}</body></html>`} /> : <p className="muted">등록된 상세설명이 없습니다.</p>}
        {!readonly && <details className="remote-description-source"><summary>상세설명 원문 편집</summary><Field label={`${EDIT_FIELDS[key]} 원문`} hint="입력한 내용은 그대로 저장됩니다."><textarea rows={8} value={fields[key] ?? ''} onChange={e => onChange?.(key, e.target.value)} /></Field></details>}
      </ModalSection>)}
    </div>
  </>;
}

function RemoteEditor({ goods, onClose, onPrepared }: { goods: RemoteGoods; onClose(): void; onPrepared(op: GodomallOperation): void }) {
  const [fields, setFields] = useState(goods.fields), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const prepare = async () => { if (lock.current) return; if (fields.originNm !== goods.fields.originNm) { const originError = core.originIssue(fields.originNm); if (originError) { setError(originError); return; } } lock.current = true; setBusy(true); setError(''); try { const changes = Object.fromEntries(Object.keys(EDIT_FIELDS).filter(key => fields[key] !== goods.fields[key]).map(key => [key, fields[key]])); const result = await post<{ operation: GodomallOperation }>(`/godomall/${goods.mallId}/operations/prepare`, { kind: 'update', goodsNo: goods.goodsNo, fingerprint: goods.fingerprint, changes }); onPrepared(result.operation); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); } };
  const changedKeys = Object.keys(EDIT_FIELDS).filter(key => fields[key] !== goods.fields[key]);
  return <Modal className="product-editor-modal remote-product-modal" title="상품 편집" subtitle={`${MALLS[goods.mallId].name} · 상품번호 ${goods.goodsNo}`} onClose={onClose} dismissible={!busy} confirmClose width={800} footer={<><div className="operations-footer-copy"><strong>{MALLS[goods.mallId].name} 상품 변경 · {changedKeys.length}개 항목</strong><small>검토 후 실행하면 실제 상품에 적용됩니다.</small></div><ModalCloseButton disabled={busy}>취소</ModalCloseButton><Button variant="primary" disabled={busy} onClick={() => void prepare()}>{busy ? '최신 원본 대조 중…' : '변경 전·후 검토'}</Button></>}>
    <fieldset className="form-stack form-fieldset operations-review operations-remote-editor" disabled={busy}>
      {error && <div role="alert" className="alert error">{error}</div>}
      <RemotePreservationNotice issues={goods.preservationIssues} />
      <RemoteProductFields goods={goods} fields={fields} onChange={(key, value) => setFields(current => ({ ...current, [key]: value }))} />
    </fieldset>
  </Modal>;
}
