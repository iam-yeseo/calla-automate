import { Select } from './components/ui/Select';
import { Progress } from './components/ui/Progress';
import { useEffect, useRef, useState } from 'react';
import type { Channel, Product, ProductList, Registration, Settings } from './types';
import { api, DEMO, post } from './api';
import { core, listState, dateText, money } from './domain';
import { mallBrands, registrationBlocked, resolveBrand } from './mall-settings';
import { MALLS, OPERATION_LABELS, type GodomallOperation } from './godomall-types';
import { OperationDialog, OperationNotice } from './Godomall';
import RegistrationDefaults from './RegistrationDefaults';
import ProductRegistrationPreview from './ProductRegistrationPreview';
import PreviewProductEditor from './PreviewProductEditor';
import { loadPreviewProduct, savePreviewProduct } from './preview-product-edit';
import './operations-redesign.css';
import { Badge, Button, Empty, Modal, ModalCloseButton, PageTitle, PageFooter, Search } from './ui';

const MALL_IDS = ['retail', 'wholesale'] as const;
type Target = { key: string; product: Product; mall: Channel; brand: string; blocked: string | null; selected: boolean; operation?: GodomallOperation; error?: string; needsRefresh?: boolean };
export default function Automation({ lists, settings, admin, onOpen, onRefresh, onBusy, notify, initialSelection }: {
  lists: ProductList[]; settings: Settings; admin: boolean; initialSelection?: { listId: string; itemIds: string[] }; onOpen(id: string): void; onRefresh(): void; onBusy(value: boolean): void; notify(text: string): void;
}) {
  const [query, setQuery] = useState(''), [tab, setTab] = useState(() => { const initialList = lists.find(list => list.id === initialSelection?.listId); return initialList && listState(initialList) === 'success' ? 'completed' : 'pending'; }), [review, setReview] = useState<ProductList | null>(null);
  const [activeListId, setActiveListId] = useState(initialSelection?.listId || ''), [previewItems, setPreviewItems] = useState<Product[]>([]), [previewRegistrations, setPreviewRegistrations] = useState<Registration[]>([]);
  const [pickedIds, setPickedIds] = useState<string[]>([]), [previewLoading, setPreviewLoading] = useState(false), [previewError, setPreviewError] = useState(''), [previewRevision, setPreviewRevision] = useState(0);
  const [targets, setTargets] = useState<Target[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [phase, setPhase] = useState<'select' | 'review' | 'result'>('select');
  const [confirmed, setConfirmed] = useState(false), [progress, setProgress] = useState(''), [inspecting, setInspecting] = useState<GodomallOperation | null>(null);
  const [previewTarget, setPreviewTarget] = useState('');
  const [editingPreview, setEditingPreview] = useState<{ product: Product; mall: Channel } | null>(null);
  const lock = useRef(false), stop = useRef(false), attempted = useRef(new Set<string>());
  const initialReviewKey = useRef(''), previewSelection = useRef(initialSelection);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => () => { stop.current = true; }, []);
  const filtered = lists.filter(l => (tab === 'completed' ? listState(l) === 'success' : listState(l) !== 'success') && `${l.title} ${l.author}`.toLowerCase().includes(query.toLowerCase()));
  const activeList = filtered.find(list => list.id === activeListId) || filtered[0];
  useEffect(() => {
    const controller = new AbortController(); setPreviewItems([]); setPreviewRegistrations([]); setPickedIds([]); setPreviewError('');
    if (!activeList) { setPreviewLoading(false); return; }
    setPreviewLoading(true);
    Promise.all([api<{ items: Product[] }>(`/lists/${activeList.id}/items`, { signal: controller.signal }), api<{ registrations: Registration[] }>(`/lists/${activeList.id}/registrations`, { signal: controller.signal })])
      .then(([data, registrationData]) => {
        if (controller.signal.aborted) return;
        const products = data.items.map(product => ({ ...product, automation: core.normalize(product.automation) }));
        setPreviewItems(products); setPreviewRegistrations(registrationData.registrations);
        const requested = previewSelection.current?.listId === activeList.id ? previewSelection.current.itemIds : null;
        setPickedIds(products.filter(product => (!requested || requested.includes(product.id)) && MALL_IDS.some(mall => !registrationBlocked(product, registrationData.registrations, mall))).map(product => product.id));
        if (requested) previewSelection.current = undefined;
      }).catch(error => { if (!controller.signal.aborted) setPreviewError(error.message); }).finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [activeList?.id, previewRevision]);
  const previewAvailable = previewItems.filter(product => MALL_IDS.some(mall => !registrationBlocked(product, previewRegistrations, mall)));
  const previewAllSelected = previewAvailable.length > 0 && previewAvailable.every(product => pickedIds.includes(product.id));
  const previewSelected = previewItems.filter(product => pickedIds.includes(product.id));
  const previewTargets = previewSelected.reduce((total, product) => total + MALL_IDS.filter(mall => !registrationBlocked(product, previewRegistrations, mall)).length, 0);
  const selected = targets.filter(row => row.selected), available = targets.filter(row => !row.blocked);
  const allSelected = available.length > 0 && available.every(row => row.selected);
  const hasWholesaleDifference = selected.some(row => row.mall === 'wholesale' && row.product.price_wholesale_master !== null && row.product.price_wholesale_master !== row.product.price_wholesale);
  const setRow = (key: string, change: Partial<Target>) => setTargets(rows => rows.map(row => row.key === key ? { ...row, ...change } : row));
  async function openReview(list: ProductList, productIds: string[]) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setProgress('등록할 상품을 불러오는 중…');
    try {
      const [a, b] = await Promise.all([api<{ items: Product[] }>(`/lists/${list.id}/items`), api<{ registrations: Registration[] }>(`/lists/${list.id}/registrations`)]);
      const rows = a.items.filter(product => productIds.includes(product.id)).flatMap(original => {
        const product = { ...original, automation: core.normalize(original.automation) };
        return MALL_IDS.map(mall => {
          const blocked = registrationBlocked(product, b.registrations, mall);
          return { key: `${product.id}:${mall}`, product, mall, brand: resolveBrand(product, settings, mall), blocked, selected: !blocked };
        });
      });
      setTargets(rows); setConfirmed(false); setPhase('select'); attempted.current.clear(); setReview(list);
    } catch (e) { notify((e as Error).message); }
    finally { setBusy(false); lock.current = false; setProgress(''); }
  }
  useEffect(() => {
    if (!initialSelection || !admin) return;
    const key = `${initialSelection.listId}:${initialSelection.itemIds.join(',')}`;
    const list = lists.find(list => list.id === initialSelection.listId);
    if (!list || !initialSelection.itemIds.length || initialReviewKey.current === key) return;
    initialReviewKey.current = key;
    previewSelection.current = initialSelection;
    setActiveListId(list.id); setTab(listState(list) === 'success' ? 'completed' : 'pending');
    void openReview(list, initialSelection.itemIds);
  }, [initialSelection, lists, admin]);
  async function prepare() {
    if (lock.current || !selected.length) return; lock.current = true; setBusy(true); setError(''); stop.current = false;
    let failed = false;
    try {
      for (const [index, row] of selected.entries()) {
        setProgress(`등록 내용 검증 ${index + 1} / ${selected.length}`);
        try {
          const result = await post<{ operation: GodomallOperation }>(`/godomall/${row.mall}/operations/prepare`, { kind: 'insert', itemId: row.product.id, choices: { brandCd: row.brand, scmNo: '1' } });
          setRow(row.key, { operation: result.operation, error: undefined, needsRefresh: false });
        } catch (e) { failed = true; setRow(row.key, { operation: undefined, error: (e as Error).message, needsRefresh: true }); }
        if (stop.current) { failed = true; break; }
      }
      if (failed) setError('검증하지 못한 상품이 있습니다. 아래 내용을 확인하고 선택 또는 상품 정보를 수정해 주세요.');
      else { setConfirmed(false); setPreviewTarget(selected[0]?.key || ''); setPhase('review'); }
    } finally { setBusy(false); lock.current = false; setProgress(''); }
  }
  async function editPreview(row: Target) {
    if (lock.current || phase !== 'review') return;
    lock.current = true; setBusy(true); setConfirmed(false); setError('');
    try { setEditingPreview({ product: await loadPreviewProduct(row.product.id), mall: row.mall }); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function savePreview(product: Product, file?: File) {
    if (lock.current || !editingPreview || phase !== 'review') return;
    lock.current = true; setBusy(true); setConfirmed(false); setError('');
    // A save can change the source revision even if its response is interrupted.
    // Keep every earlier snapshot for this item ineligible until re-prepared.
    setTargets(rows => rows.map(row => row.product.id === product.id ? { ...row, needsRefresh: true } : row));
    try {
      const saved = await savePreviewProduct(product, file);
      setPreviewItems(items => items.map(item => item.id === saved.id ? saved : item));
      const original = editingPreview.product;
      const revised = targets.filter(row => row.product.id === saved.id).map(row => ({ ...row, product: saved, brand: saved.brand !== original.brand || saved.automation.brandCodes?.[row.mall] !== original.automation.brandCodes?.[row.mall] ? resolveBrand(saved, settings, row.mall) : row.brand, needsRefresh: true }));
      setEditingPreview({ product: saved, mall: editingPreview.mall });
      setTargets(rows => rows.map(row => revised.find(next => next.key === row.key) || row));
      let failed = false;
      for (const [index, row] of revised.filter(row => row.selected).entries()) {
        setProgress(`수정한 등록 내용 검증 ${index + 1} / ${revised.filter(row => row.selected).length}`);
        try {
          const result = await post<{ operation: GodomallOperation }>(`/godomall/${row.mall}/operations/prepare`, { kind: 'insert', itemId: saved.id, choices: { brandCd: row.brand, scmNo: '1' } });
          setRow(row.key, { operation: result.operation, error: undefined, needsRefresh: false });
        } catch (e) { failed = true; setRow(row.key, { operation: undefined, error: (e as Error).message, needsRefresh: true }); }
      }
      onRefresh();
      if (failed) setError('상품 초안은 저장했지만 일부 몰의 미리보기를 검증하지 못했습니다. 내용을 확인하고 다시 저장하거나 미리보기를 다시 검증해 주세요.');
      else { setEditingPreview(null); notify('상품 초안을 저장하고 몰별 미리보기를 갱신했습니다. 등록 내용을 다시 확인해 주세요.'); }
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); setProgress(''); }
  }
  async function execute() {
    if (lock.current || editingPreview || !confirmed || phase !== 'review' || selected.some(row => row.needsRefresh || !row.operation || row.operation.state !== 'prepared' || attempted.current.has(row.operation.id))) return;
    lock.current = true; stop.current = false; setBusy(true); setError(''); setPhase('result');
    try {
      for (const [index, row] of selected.entries()) {
        if (stop.current) break;
        const op = row.operation!; attempted.current.add(op.id); setProgress(`API 등록 및 결과 확인 ${index + 1} / ${selected.length}`);
        try {
          const result = await post<{ operation: GodomallOperation }>(`/godomall/${row.mall}/operations/${op.id}/execute`, { confirmed: true });
          setRow(row.key, { operation: result.operation });
          if (result.operation.state !== 'success') { setError('확인이 필요한 결과가 있어 다음 상품 전송을 멈췄습니다. 작업 결과를 확인해 주세요.'); break; }
        } catch (e) {
          setRow(row.key, { error: `${(e as Error).message} 작업 결과에서 상태를 조회해 주세요.` });
          setError('응답을 확인하지 못해 다음 상품 전송을 멈췄습니다. 같은 등록 요청을 반복하지 않습니다.'); break;
        }
      }
    } finally { setBusy(false); lock.current = false; setProgress(''); onRefresh(); }
  }
  function close() {
    if (busy) return;
    if (activeList) previewSelection.current = { listId: activeList.id, itemIds: pickedIds };
    setReview(null); setInspecting(null); setEditingPreview(null); setPreviewRevision(value => value + 1); onRefresh();
  }
  const setupReady = selected.length > 0;
  const selectedProducts = [...new Map(selected.map(row => [row.product.id, row.product])).values()];
  const activePreview = selected.find(row => row.key === previewTarget) || selected[0];
  const previewReady = selected.length > 0 && selected.every(row => !row.needsRefresh && row.operation?.state === 'prepared' && !attempted.current.has(row.operation.id));
  const successCount = selected.filter(row => row.operation?.state === 'success').length;
  const failedCount = selected.filter(row => row.operation?.state === 'failed').length;
  const uncertainCount = selected.filter(row => row.error || row.operation?.state === 'needs_review').length;
  return <div className="operations-page automation-page">
    <PageTitle title="자동 상품 등록" description="저장된 리스트에서 상품과 몰을 선택하고, 검토 후 API로 등록합니다." />
    <div className="tabs operations-tabs"><button className={'tab ' + (tab === 'pending' ? 'active' : '')} onClick={() => setTab('pending')}>등록 가능한 리스트 <span>{lists.filter(l => listState(l) !== 'success').length}</span></button><button className={'tab ' + (tab === 'completed' ? 'active' : '')} onClick={() => setTab('completed')}>등록 완료 리스트 <span>{lists.filter(l => listState(l) === 'success').length}</span></button></div>
    <div className="toolbar operations-search"><Search value={query} onChange={setQuery} placeholder="리스트 이름 또는 등록자 검색" /><Button variant="ghost" onClick={() => setQuery('')}>초기화</Button>{busy && !review && <span role="status">{progress}</span>}</div>
    <div className="automation-selection">
      <nav className="automation-list-selector" aria-label="저장된 상품 리스트">{filtered.map(list => <button key={list.id} type="button" className={'automation-list-card ' + (activeList?.id === list.id ? 'active' : '')} aria-pressed={activeList?.id === list.id} onClick={() => setActiveListId(list.id)}><strong>{list.title}</strong><small>{dateText(list.work_date)} · {list.author || '등록자 미지정'} · {list.total || 0}개</small><Badge state={listState(list) === 'pending' ? 'success' : listState(list)}>{listState(list) === 'success' ? '작업 완료' : listState(list) === 'warning' ? '확인 필요' : listState(list) === 'running' ? '진행 중' : '저장 완료'}</Badge></button>)}</nav>
      <section className="automation-products" aria-busy={previewLoading}>
        {activeList ? <><div className="section-heading"><h2>{activeList.title}</h2><Button variant="ghost" onClick={() => onOpen(activeList.id)}>리스트 상세</Button></div>
          {previewError && <div className="alert error" role="alert">{previewError}<Button onClick={() => setPreviewRevision(value => value + 1)}>다시 불러오기</Button></div>}
          {previewLoading ? <div className="operations-loading" role="status">저장된 상품을 불러오고 있습니다…</div> : <div className="table-wrap automation-products-table"><table className="data-table"><thead><tr><th className="check-cell"><input type="checkbox" aria-label="현재 리스트 등록 가능한 상품 전체 선택" disabled={!admin || tab === 'completed' || busy || previewLoading || !previewAvailable.length} checked={previewAllSelected} ref={element => { if (element) element.indeterminate = !previewAllSelected && previewAvailable.some(product => pickedIds.includes(product.id)); }} onChange={event => setPickedIds(event.target.checked ? previewAvailable.map(product => product.id) : [])}/></th><th>상품 / 모델</th><th className="numeric">소매 정가</th><th className="numeric">소매 판매가</th><th className="numeric">도매 정가</th><th className="numeric">도매 베이직</th><th className="numeric">도매 마스터</th><th>준비 상태</th></tr></thead><tbody>{previewItems.map(product => {
            const reasons = MALL_IDS.map(mall => registrationBlocked(product, previewRegistrations, mall));
            const blocked = reasons.every(Boolean);
            return <tr key={product.id}><td className="check-cell"><input type="checkbox" aria-label={`${core.displayName(product.name_own) || '상품'} 등록 선택`} disabled={blocked || !admin || busy || tab === 'completed'} checked={pickedIds.includes(product.id)} onChange={event => setPickedIds(ids => event.target.checked ? [...ids, product.id] : ids.filter(id => id !== product.id))} /></td><td><strong>{core.displayName(product.name_own) || '상품명 없음'}</strong><small className="secondary">{product.brand} · {product.model || '모델 미입력'}</small></td><td className="numeric">{money(product.price_retail_regular)}</td><td className="numeric">{money(product.price_retail)}</td><td className="numeric">{money(core.wholesaleRegularPrice(product))}</td><td className="numeric">{money(product.price_wholesale)}</td><td className="numeric">{money(product.price_wholesale_master)}</td><td title={blocked ? MALL_IDS.map((mall, index) => `${MALLS[mall].name}: ${reasons[index]}`).join('\n') : undefined}><Badge state={blocked ? reasons.includes('기존 결과 확인 필요') ? 'warning' : 'pending' : 'success'}>{blocked ? reasons.includes('기존 결과 확인 필요') ? '확인 필요' : '선택 제외' : '검토 가능'}</Badge></td></tr>;
          })}</tbody></table>{!previewItems.length && !previewError && <Empty title="저장된 상품이 없습니다" description="리스트 상세에서 상품을 추가하고 저장해 주세요." />}</div>}
        </> : <Empty title={tab === 'completed' ? '완료된 리스트가 없습니다' : '등록할 리스트가 없습니다'} description="상품 목록에서 새 리스트를 만들거나 검색 조건을 변경해 주세요." />}
      </section>
    </div>
    <PageFooter><div className="operations-footer-copy"><strong>선택 상품 {previewSelected.length}개 · 소매 / 도매 · 총 {previewTargets}건</strong><small>배송·이용안내는 기본 설정으로 자동 적용합니다.</small></div>{admin && tab !== 'completed' ? <Button variant="primary" disabled={busy || previewLoading || !activeList || !previewTargets} onClick={() => activeList && void openReview(activeList, pickedIds)}>등록 전 검토</Button> : activeList && <Button onClick={() => onOpen(activeList.id)}>상품 보기</Button>}</PageFooter>
    {review && <Modal dismissible={!busy} confirmClose={!!editingPreview} icon="bolt" title={phase === 'result' ? 'API 등록 결과' : '등록 전 검토'} subtitle={`${review.title} · 선택 상품 ${selectedProducts.length}개 · 총 ${selected.length}건`} onClose={close} width={1160} footer={<>
      <div className="operations-footer-copy"><strong>상품 {selectedProducts.length}개 · 등록 작업 {selected.length}건</strong><small>{phase === 'result' ? `반영 확인 ${successCount}건 · 실패 ${failedCount}건 · 확인 필요 ${uncertainCount}건` : '성공한 몰 작업은 건너뜁니다. 미확인 결과는 자동 재등록하지 않습니다.'}</small></div>
      <ModalCloseButton disabled={busy}>{phase === 'result' ? '닫기' : '취소'}</ModalCloseButton>
      {busy && <Button onClick={() => { stop.current = true; setProgress('현재 상품 확인 후 멈춥니다…'); }}>현재 상품 후 멈추기</Button>}
      {!busy && phase === 'review' && !editingPreview && <Button onClick={() => { setPhase('select'); setConfirmed(false); }}>선택 다시 하기</Button>}
      {phase === 'select' && <Button variant="primary" disabled={busy || !setupReady || DEMO} onClick={() => void prepare()}>{busy ? '검증 중…' : `선택한 ${selected.length}건 검토`}</Button>}
      {phase === 'review' && <Button variant="primary" disabled={busy || !!editingPreview || !previewReady || !confirmed || DEMO} onClick={() => void execute()}>API로 {selected.length}건 등록</Button>}
    </>}><div className="form-stack registration-review operations-review">
      {error && !editingPreview && <div className="alert error" role="alert">{error}</div>}
      {phase === 'result' ? <><Progress completed={successCount} total={selected.length} label="상품 등록 진행률" paused={!busy && successCount < selected.length} description={busy ? progress : successCount === selected.length ? '선택한 모든 몰에 등록을 완료했습니다.' : error ? '확인이 필요한 결과가 있어 등록을 중단했습니다.' : '현재 상품 처리 후 등록을 멈췄습니다.'} /><div className="operations-progress" aria-label="등록 진행 단계"><div className="complete"><strong>실행 전 검토</strong><small>등록 내용 확인 완료</small></div><div className={busy ? 'current' : 'complete'}><strong>요청 처리 중</strong><small>{attempted.current.size} / {selected.length}건 요청</small></div><div className={busy || uncertainCount ? 'current' : 'complete'}><strong>결과 확인 중</strong><small>{uncertainCount ? `${uncertainCount}건 확인 필요` : busy ? '같은 몰에서 결과 확인' : '결과 확인 종료'}</small></div><div className={!busy && successCount === selected.length ? 'complete' : ''}><strong>반영 확인</strong><small>{successCount}건 완료</small></div></div>{uncertainCount > 0 && <OperationNotice tone="warning">응답이 끊긴 작업은 실패로 확정하지 않습니다. 작업 결과에서 실제 고도몰 결과를 다시 확인해 주세요.</OperationNotice>}</> : phase === 'select' ? <><div className="operations-checks"><Badge state="success">저장 완료</Badge><Badge state="pending">등록 내용 검증 전</Badge>{MALL_IDS.filter(mall => selected.some(row => row.mall === mall)).map(mall => <Badge key={mall} state="success">{MALLS[mall].name} 기본 설정</Badge>)}</div><OperationNotice>고도몰 API로 등록합니다. Chrome 로그인이나 로컬 실행기 연결이 필요하지 않습니다.</OperationNotice>
        <section className="operations-section"><h3>상품과 가격 · 원</h3><div className="table-wrap operations-price-table"><table className="data-table"><thead><tr><th>선택 상품</th><th className="numeric">소매 정가</th><th className="numeric">소매 판매가</th><th className="numeric">도매 정가</th><th className="numeric">도매 베이직</th><th className="numeric">도매 마스터</th></tr></thead><tbody>{selectedProducts.map(product => <tr key={product.id}><td>{core.displayName(product.name_own)}<small className="secondary">{product.model}</small></td><td className="numeric">{money(product.price_retail_regular)}</td><td className="numeric">{money(product.price_retail)}</td><td className="numeric">{money(core.wholesaleRegularPrice(product))}</td><td className="numeric">{money(product.price_wholesale)}</td><td className="numeric">{money(product.price_wholesale_master)}</td></tr>)}</tbody></table></div></section>
      </> : null}
      {hasWholesaleDifference && <OperationNotice tone="brand">도매 베이직 가격을 기본 판매가로 등록합니다. 도매 마스터 가격은 API로 전송되지 않습니다.</OperationNotice>}
      {phase === 'select' && <section className="operations-section"><h3>몰별 등록 설정</h3><RegistrationDefaults malls={MALL_IDS.filter(mall => selected.some(row => row.mall === mall))} /></section>}
      {phase === 'review' && activePreview && <>
        <nav className="registration-preview-nav" aria-label="등록 상품 미리보기 선택">{selected.map((row, index) => <button key={row.key} type="button" disabled={busy || !!editingPreview} aria-pressed={activePreview.key === row.key} onClick={() => setPreviewTarget(row.key)}><strong>{MALLS[row.mall].name} · {index + 1} / {selected.length}</strong><span>{core.displayName(row.product.name_own)}</span></button>)}</nav>
        {editingPreview ? <PreviewProductEditor key={`${editingPreview.product.id}:${editingPreview.product.updated_at}`} product={editingPreview.product} settings={settings} mall={editingPreview.mall} busy={busy} error={error} onCancel={() => { setEditingPreview(null); setError(''); }} onSave={savePreview} /> : <>
          {!previewReady && <OperationNotice tone="warning">상품 정보가 바뀌어 등록 내용을 다시 검증해야 합니다. 이전 미리보기로는 등록할 수 없습니다.<Button disabled={busy} onClick={() => void prepare()}>미리보기 다시 검증</Button></OperationNotice>}
          {activePreview.operation ? <><ProductRegistrationPreview key={activePreview.operation.id} operation={activePreview.operation} onEdit={() => void editPreview(activePreview)} editDisabled={busy} />
            {activePreview.operation.warnings.length > 0 && <details className="preview-notices"><summary>확인할 안내 {activePreview.operation.warnings.length}개</summary><ul>{activePreview.operation.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
            <details className="preview-technical"><summary>전송 항목 확인</summary><dl>{activePreview.operation.changes.map(change => <div key={change.field}><dt>{change.label}</dt><dd>{change.after || '(빈 값)'}</dd></div>)}</dl></details></> : <Button disabled={busy} onClick={() => void editPreview(activePreview)}>등록 내용 수정</Button>}
        </>}
      </>}
      {phase !== 'review' && <>      <section className="operations-section"><h3>{phase === 'result' ? '상품별 실제 결과' : '몰별 상품과 검토 결과'}</h3>
      <div className="table-wrap registration-review-table"><table className="data-table"><thead><tr>{phase === 'select' && <th className="check-cell"><input aria-label="등록 가능한 상품 전체 선택" type="checkbox" disabled={busy || !available.length} checked={allSelected} ref={element => { if (element) element.indeterminate = !allSelected && selected.length > 0; }} onChange={e => setTargets(rows => rows.map(row => ({ ...row, selected: !row.blocked && e.target.checked })))} /></th>}<th>상품 / 모델</th><th>대상 몰</th><th>{phase === 'result' ? '고도몰 상품번호' : '카테고리 / 브랜드'}</th><th className="numeric">판매가</th><th>{phase === 'result' ? '실제 결과 / 다음 행동' : '검토 결과'}</th></tr></thead><tbody>{(phase === 'select' ? targets : selected).map(row => <tr key={row.key} className={row.blocked ? 'review-row-disabled' : ''}>
        {phase === 'select' && <td className="check-cell"><input type="checkbox" aria-label={`${core.displayName(row.product.name_own)} ${MALLS[row.mall].name} 선택`} disabled={busy || !!row.blocked} checked={row.selected} onChange={e => setRow(row.key, { selected: e.target.checked })} /></td>}
        <td><strong>{core.displayName(row.product.name_own)}</strong><small className="secondary">{row.product.model || '모델 미입력'}</small></td><td>{MALLS[row.mall].name}</td>
        <td>{phase === 'result' ? row.operation?.goods_no || '미확인' : <><span>{core.path(settings.categories[row.mall], row.product.automation.categoryCodes[row.mall]) || '카테고리 미선택'}</span><small className="secondary">{row.product.automation.categoryCodes[row.mall] || '—'}</small>{phase === 'select' && !row.blocked ? <Select aria-label={`${core.displayName(row.product.name_own)} ${MALLS[row.mall].name} 브랜드`} value={row.brand} disabled={busy} onChange={e => setRow(row.key, { brand: e.target.value })}><option value="">브랜드 코드 없음</option>{mallBrands(settings, row.mall).map(brand => <option key={brand.code} value={brand.code}>{brand.name} ({brand.code})</option>)}</Select> : <small className="secondary">{mallBrands(settings, row.mall).find(b => b.code === row.brand)?.name || '브랜드 코드 없음'}{row.brand ? ` (${row.brand})` : ''}</small>}</>}</td>
        <td className="numeric">{money(row.mall === 'retail' ? row.product.price_retail : row.product.price_wholesale)}원</td>
        <td>{row.blocked ? <span className="muted">{row.blocked}</span> : row.error ? <span className="godomall-result-error">{row.error}</span> : row.operation ? <Badge state={row.operation.state === 'success' ? 'success' : ['failed', 'needs_review'].includes(row.operation.state) ? 'warning' : 'pending'}>{phase === 'result' && row.operation.state === 'prepared' ? '전송하지 않음' : OPERATION_LABELS[row.operation.state]}</Badge> : <span className="muted">검토 대기</span>}

        {row.operation && phase === 'result' && <Button variant="ghost" disabled={busy} onClick={() => setInspecting(row.operation!)}>작업 결과</Button>}</td>
      </tr>)}</tbody></table></div></section>
</>}
      {phase === 'review' && <><OperationNotice tone="brand">PC·모바일 모두 숨김 상태로 등록합니다. 등록 후 상품 조회에서 결과를 확인해 주세요.</OperationNotice><label className="check-label"><input type="checkbox" disabled={busy || !!editingPreview || !previewReady} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />몰별 상품·카테고리·브랜드·판매가와 등록 내용을 확인했습니다.</label></>}
      {phase === 'result' && !busy && <p className="muted">실행한 작업은 상품 조회의 작업 이력에 저장됩니다. 전송하지 않은 상품은 이 창을 닫고 다시 검토할 수 있습니다.</p>}
    </div></Modal>}
    {inspecting && <OperationDialog initial={inspecting} admin allowExecute={false} onClose={() => setInspecting(null)} onDraftSaved={saved => { setPreviewItems(items => items.map(item => item.id === saved.id ? saved : item)); setTargets(rows => rows.map(row => row.product.id === saved.id ? { ...row, product: saved } : row)); onRefresh(); }} onChanged={op => { setTargets(rows => rows.map(row => row.operation?.id === op.id ? { ...row, operation: op, error: undefined } : row)); onRefresh(); }} />}
  </div>;
}
