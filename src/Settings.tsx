import { Select } from './components/ui/Select';
import { useEffect, useRef, useState } from 'react';
import { api, DEMO, post } from './api';
import { core } from './domain';
import { mallBrands } from './mall-settings';
import type { Category, Channel, Settings as SettingsData } from './types';
import { Badge, Button, Empty, Field, Modal, ModalCloseButton, PageFooter, PageTitle, Search } from './ui';
import './settings-redesign.css';

type Kind = 'categories' | 'brands';
interface Sync { kind: Kind; status: 'syncing' | 'success' | 'failed'; count: number; checked: number; remaining: number; syncedAt: string | null; error: string | null }
const malls: Channel[] = ['retail', 'wholesale'];
const mallName = (mall: Channel) => mall === 'retail' ? '소매' : '도매';
const visibility = (flag?: string) => flag === 'y' ? '노출' : flag === 'n' ? '숨김' : '미확인';

function CategoryTree({ categories, mall, selected, query, disabled, onSelect }: {
  categories: Category[]; mall: Channel; selected: string; query: string; disabled: boolean; onSelect(code: string): void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(categories.filter(c => !c.parentCode).slice(0, 1).map(c => c.code)));
  const search = query.trim().toLowerCase();
  const children = new Map<string, Category[]>();
  for (const category of categories) children.set(category.parentCode, [...(children.get(category.parentCode) || []), category]);
  const shown = search ? categories.filter(c => `${core.path(categories, c.code)} ${c.code}`.toLowerCase().includes(search)) : categories.filter(c => {
    let parent = c.parentCode;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      if (!expanded.has(parent)) return false;
      parent = categories.find(candidate => candidate.code === parent)?.parentCode || '';
    }
    return true;
  });
  return <section className="taxonomy-tree" aria-label={`고도몰 ${mallName(mall)} 카테고리`}>
    <div className="taxonomy-tree-heading"><h2>고도몰 {mallName(mall)} · 카테고리</h2><span>{categories.length}개</span></div>
    <div className="taxonomy-tree-body">
      {shown.map(category => {
        const hasChildren = children.has(category.code), open = expanded.has(category.code), active = selected === category.code;
        return <div key={category.code} className={`taxonomy-tree-row${active ? ' is-selected' : ''}`} style={{ paddingLeft: 12 + (search ? 0 : Math.max(0, category.code.length / 3 - 1) * 16) }}>
          {hasChildren && !search ? <button className="taxonomy-tree-toggle" aria-label={`${category.name} ${open ? '접기' : '펼치기'}`} aria-expanded={open} disabled={disabled} onClick={() => setExpanded(old => { const next = new Set(old); if (next.has(category.code)) next.delete(category.code); else next.add(category.code); return next; })}>{open ? '▾' : '▸'}</button> : <span className="taxonomy-tree-spacer" aria-hidden="true" />}
          <button className="taxonomy-tree-label" disabled={disabled} aria-pressed={active} onClick={() => onSelect(category.code)}><span>{active && <span aria-hidden="true">✓ </span>}{search ? core.path(categories, category.code) : category.name}</span><span className="taxonomy-tree-code"> · {category.code}</span></button>
        </div>;
      })}
      {!shown.length && <Empty title={search ? '검색 결과가 없습니다' : '카테고리가 없습니다'} description={search ? '이름이나 코드를 다시 확인해 주세요.' : '고도몰에서 카테고리를 업데이트해 주세요.'} />}
    </div>
  </section>;
}

export default function Settings({ page, value, onSave, onUpdated, admin }: {
  page: string; value: SettingsData; onSave(value: SettingsData): Promise<void>; onUpdated(): Promise<void>; admin: boolean;
}) {
  const [query, setQuery] = useState(''), [channel, setChannel] = useState<Channel>('retail');
  const [tab, setTab] = useState<Kind>('categories'), [selected, setSelected] = useState<Record<Channel, string>>({ retail: '', wholesale: '' });
  const [folder, setFolder] = useState(''), [addingFolder, setAddingFolder] = useState(false), [selectedFolder, setSelectedFolder] = useState('');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [syncing, setSyncing] = useState(false), [copied, setCopied] = useState(false);
  const [syncs, setSyncs] = useState<Sync[]>([]), run = useRef(0), locked = useRef(false);
  const isFolder = page === 'folders', isBrand = !isFolder && tab === 'brands';
  const folders = value.folders.filter(f => `${f} ${core.BASE}${f}/`.toLowerCase().includes(query.toLowerCase()));
  const activeFolder = folders.includes(selectedFolder) ? selectedFolder : folders[0] || '';
  const currentSync = syncs.find(s => s.kind === tab), syncedAt = value.taxonomySyncedAt?.[channel]?.[tab];
  const brandRows = mallBrands(value, channel).filter(brand => core.brandMatches(brand, query));
  useEffect(() => {
    const controller = new AbortController(); setSyncs([]);
    if (!isFolder && !DEMO) api<{ syncs: Sync[] }>(`/godomall/${channel}/taxonomy`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setSyncs(data.syncs); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); run.current++; };
  }, [channel, isFolder]);
  async function commit(next: SettingsData) {
    setSaving(true); setError('');
    try { core.validateSettings(next); await onSave(next); setAddingFolder(false); setFolder(''); }
    catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }
  async function update(forceRestart = false) {
    if (locked.current) return;
    locked.current = true; const id = ++run.current; setSyncing(true); setError('');
    try {
      let restart = forceRestart || !currentSync || currentSync.status === 'success';
      for (let step = 0; step < 1500 && run.current === id; step++) {
        const data = await post<{ sync: Sync }>(`/godomall/${channel}/taxonomy/${tab}/sync`, { restart }); restart = false;
        if (run.current !== id) return;
        setSyncs(old => [...old.filter(s => s.kind !== tab), data.sync]);
        if (data.sync.status === 'failed') throw new Error(data.sync.error || '업데이트를 완료하지 못했습니다.');
        if (data.sync.status === 'success') { await onUpdated(); return; }
      }
    } catch (err) { if (run.current === id) setError((err as Error).message); }
    finally { locked.current = false; setSyncing(false); }
  }
  async function copyFolder() {
    try { await navigator.clipboard.writeText(`${core.BASE}${activeFolder}/`); setCopied(true); }
    catch { setError('주소를 복사하지 못했습니다. 서버 경로를 직접 선택해 복사해 주세요.'); }
  }
  return <div className={`settings-redesign ${isFolder ? 'folder-settings' : 'taxonomy-settings'}`}>
    <PageTitle title={isFolder ? '서버 이미지 폴더' : '카테고리와 브랜드'}
      description={isFolder ? '이미지 URL에 사용할 서버 폴더와 카테고리 연결을 관리합니다.' : '소매와 도매의 카테고리 및 브랜드 코드를 각각 확인하고 이미지 폴더를 연결합니다.'}
      actions={admin && (isFolder ? <Button variant="primary" disabled={saving} onClick={() => { setError(''); setAddingFolder(true); }}>폴더 추가</Button> : <Button variant="primary" disabled={syncing || saving || DEMO} onClick={() => void update()}>{syncing ? '업데이트 중…' : currentSync && ['failed', 'syncing'].includes(currentSync.status) ? '업데이트 이어서 하기' : `${mallName(channel)} ${isBrand ? '브랜드' : '카테고리'} 업데이트`}</Button>)} />
    {error && !addingFolder && <div className="alert error" role="alert">{error}</div>}
    {!isFolder && <div className="tabs" role="tablist" aria-label="분류 종류">
      <button role="tab" aria-selected={tab === 'categories'} disabled={syncing} className={'tab ' + (tab === 'categories' ? 'active' : '')} onClick={() => { setTab('categories'); setQuery(''); }}>카테고리</button>
      <button role="tab" aria-selected={tab === 'brands'} disabled={syncing} className={'tab ' + (tab === 'brands' ? 'active' : '')} onClick={() => { setTab('brands'); setQuery(''); }}>브랜드</button>
    </div>}
    <div className="toolbar settings-toolbar">
      <Search value={query} onChange={setQuery} placeholder={isFolder ? '폴더명 / 서버 경로 검색' : isBrand ? '브랜드 이름, 코드 또는 초성 검색' : '카테고리명 / 코드 검색'} />
      {!isFolder && <Select aria-label="쇼핑몰" disabled={syncing} value={channel} onChange={e => { setChannel(e.target.value as Channel); setError(''); }}><option value="retail">고도몰 소매</option><option value="wholesale">고도몰 도매</option></Select>}
      <Button variant="ghost" disabled={!query} onClick={() => setQuery('')}>초기화</Button>
      <span className="spacer" />{isFolder && <span className="muted">전체 {folders.length}개</span>}
    </div>
    {isFolder ? <>
      <div className="card table-wrap settings-table-wrap"><table className="data-table folder-table"><thead><tr><th>폴더명</th><th>서버 경로</th><th>카테고리 연결</th><th>행동</th></tr></thead><tbody>
        {folders.map(f => { const count = Object.values(value.categories).flat().filter(c => c.folder === f).length; return <tr key={f} className={activeFolder === f ? 'is-selected' : ''}><td><button className="table-link" onClick={() => { setSelectedFolder(f); setCopied(false); }}>{f}</button></td><td><span className="folder-url">{core.BASE}{f}/</span></td><td><Badge state={count ? 'connected' : 'pending'}>{count ? `${count}개 연결` : '연결 없음'}</Badge></td><td><Button aria-label={`${f} 폴더 상세`} onClick={() => { setSelectedFolder(f); setCopied(false); }}>상세</Button></td></tr>; })}
      </tbody></table>{!folders.length && <Empty title="표시할 폴더가 없습니다" description={query ? '검색 조건을 변경해 주세요.' : '폴더를 추가해 주세요.'} />}</div>
      {activeFolder && <section className="settings-detail"><h2>선택 폴더 · {activeFolder}</h2><div className="folder-detail-fields"><Field label="폴더 이름"><input value={activeFolder} readOnly /></Field><Field label="서버 경로"><input value={`${core.BASE}${activeFolder}/`} readOnly /></Field></div><div className="settings-detail-actions"><span className="muted">실제 이미지 파일은 기존 이미지 서버에서 관리합니다.</span><Button onClick={() => void copyFolder()}>{copied ? '복사 완료' : '경로 복사'}</Button></div></section>}
    </> : <>
      {!isBrand ? <>
        <div className="taxonomy-trees">{malls.map(mall => <CategoryTree key={mall} categories={value.categories[mall]} mall={mall} selected={selected[mall]} query={query} disabled={syncing} onSelect={code => { setSelected(old => ({ ...old, [mall]: code })); if (channel !== mall) setChannel(mall); }} />)}</div>
        <div className="taxonomy-selection">{malls.map(mall => { const category = value.categories[mall].find(c => c.code === selected[mall]); return <section key={mall} className="taxonomy-selection-channel"><Field label={`${mallName(mall)} 카테고리 코드`} hint={category ? core.path(value.categories[mall], category.code) : '위 목록에서 카테고리를 선택하세요.'}><input readOnly value={category?.code || ''} placeholder="카테고리 선택" /></Field><Field label={`${mallName(mall)} 이미지 폴더`}><Select aria-label={`${mallName(mall)} 이미지 폴더`} disabled={!admin || !category || saving || syncing} value={category?.folder || ''} onChange={e => void commit({ ...value, categories: { ...value.categories, [mall]: value.categories[mall].map(c => c.code === category?.code ? { ...c, folder: e.target.value } : c) } })}><option value="">지정 안 함</option>{value.folders.map(f => <option key={f}>{f}</option>)}</Select></Field>{category && <p className="muted taxonomy-display">PC {visibility(category.display)} · 모바일 {visibility(category.displayMobile)}</p>}</section>; })}</div>
      </> : <section className="settings-brand-section"><div className="settings-section-heading"><h2>고도몰 {mallName(channel)} · 브랜드 코드</h2><span className="muted">{brandRows.length}개</span></div><div className="card table-wrap settings-table-wrap"><table className="data-table"><thead><tr><th>브랜드</th><th>브랜드 코드</th><th>상위 코드</th><th>PC 노출</th><th>모바일 노출</th></tr></thead><tbody>{brandRows.map(row => <tr key={row.code}><td>{row.name}</td><td>{row.code}</td><td>{row.parentCode || '—'}</td><td>{visibility(row.display)}</td><td>{visibility(row.displayMobile)}</td></tr>)}</tbody></table>{!brandRows.length && <Empty title="표시할 브랜드가 없습니다" description="검색 조건을 바꾸거나 브랜드 업데이트를 실행해 주세요." />}</div></section>}
      <div className="taxonomy-sync-status" aria-live="polite"><span className="muted">{mallName(channel)} {isBrand ? '브랜드' : '카테고리'} · {syncedAt ? `마지막 업데이트 ${new Date(syncedAt).toLocaleString('ko-KR')}` : '아직 API 업데이트 전입니다.'}</span>{!syncing && currentSync?.status === 'failed' && admin && <Button disabled={DEMO} onClick={() => void update(true)}>처음부터 다시 조회</Button>}{syncing && <><span>분류 {currentSync?.count || 0}개 · 확인 {currentSync?.checked || 0}곳 · 남은 조회 {currentSync?.remaining ?? 1}곳</span><Button onClick={() => { run.current++; setSyncing(false); }}>잠시 멈추기</Button></>}</div>
    </>}
    <PageFooter><p>{isFolder ? '폴더는 이미지 주소 생성 기준입니다. 서버 파일의 접근 상태와 상품 내용은 직접 확인해 주세요.' : '이름과 코드는 고도몰에서 관리합니다. 이미지 폴더 연결은 즉시 저장되며, 기존 고도몰 상품은 변경하지 않습니다.'}</p>{!admin && <Badge state="pending">조회 전용</Badge>}</PageFooter>
    {addingFolder && <Modal dismissible={!saving} icon="photo" title="서버 이미지 폴더 추가" width={560} onClose={() => setAddingFolder(false)} footer={<><ModalCloseButton disabled={saving}>취소</ModalCloseButton><Button variant="primary" disabled={saving} onClick={() => void commit({ ...value, folders: [...value.folders, folder] })}>{saving ? '저장 중…' : '추가하기'}</Button></>}><fieldset className="form-stack form-fieldset" disabled={saving}><Field label="폴더 이름" hint="영문 소문자, 숫자, 대시, 밑줄만 사용할 수 있습니다."><input value={folder} onChange={e => setFolder(e.target.value)} autoFocus /></Field>{error && <div className="alert error" role="alert">{error}</div>}<p className="muted">{core.BASE}{folder || 'folder'}/</p></fieldset></Modal>}
  </div>;
}
