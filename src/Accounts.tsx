import { Select } from './components/ui/Select';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api, post, put } from './api';
import { USERNAME_PATTERN } from './Auth';
import { Badge, Button, Empty, Field, Modal, ModalCloseButton, PageFooter, PageTitle, Search, Icon } from './ui';
import type { AccountStatus, ManagedUser, Role, User } from './types';
import './settings-redesign.css';

const statusNames: Record<AccountStatus, string> = {pending: '승인 대기', active: '사용 중', disabled: '사용 중지'};
const statusTone: Record<AccountStatus, string> = {pending: 'warning', active: 'connected', disabled: 'failed'};
function accountDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`;
}

export default function Accounts({currentUser, notify, onCurrentUserUpdated}: {currentUser: User; notify: (message: string) => void; onCurrentUserUpdated: () => Promise<void>}) {
  const [users, setUsers] = useState<ManagedUser[]>([]), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{user: ManagedUser | null} | null>(null), [deleting, setDeleting] = useState<ManagedUser | null>(null), [deleteBusy, setDeleteBusy] = useState(false), [deleteError, setDeleteError] = useState('');
  const deleteLock = useRef(false);
  useEffect(()=>{
    if (currentUser.role !== 'admin') return;
    let active = true; setLoading(true); setError('');
    api<{users: ManagedUser[]; page: number; hasMore: boolean}>(`/admin/users?page=${page}`).then(result=>{
      if (active) { setUsers(result.users); setHasMore(result.hasMore); }
    }).catch(failure=>{if (active) setError(failure.message);}).finally(()=>{if (active) setLoading(false);});
    return ()=>{active=false;};
  }, [currentUser.role, page, revision]);
  if (currentUser.role !== 'admin') return <Empty title="관리자만 접근할 수 있습니다" description="사용자 계정 관리는 관리자 계정으로 로그인한 후 이용해 주세요."/>;
  const visible = users.filter(user=>(filter==='all'||user.status===filter)&&`${user.username} ${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  const refresh = ()=>setRevision(value=>value+1);
  const saved = async (account: ManagedUser | null)=>{
    setEditor(null); refresh(); notify(account ? '계정 정보를 저장했습니다.' : '사용자 계정을 만들었습니다.');
    if (account?.id === currentUser.id) {
      try { await onCurrentUserUpdated(); } catch { notify('계정은 저장했습니다. 표시 이름은 다시 로그인하면 갱신됩니다.'); }
    }
  };
  const remove = async ()=>{
    if (!deleting || deleting.id === currentUser.id || deleting.username === 'calla-admin' || deleteLock.current) return;
    deleteLock.current=true; setDeleteBusy(true); setDeleteError('');
    try { await api(`/admin/users/${encodeURIComponent(deleting.id)}`, {method:'DELETE'}); setDeleting(null); notify('사용자 계정을 삭제했습니다.'); if (users.length===1&&page>1) setPage(page-1); else refresh(); }
    catch (failure) { setDeleteError((failure as Error).message); }
    finally { deleteLock.current=false; setDeleteBusy(false); }
  };
  return <div className="accounts-redesign">
    <PageTitle title="사용자 계정 관리" description="가입 신청을 검토하고 관리자 · 조회 전용 권한과 계정 사용 상태를 관리합니다." actions={<Button variant="primary" onClick={()=>setEditor({user:null})}>계정 추가</Button>}/>
    <div className="toolbar"><Search value={query} onChange={setQuery} placeholder="현재 페이지에서 아이디 또는 이름 검색"/><Select aria-label="계정 상태" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체 승인 상태</option><option value="pending">승인 대기</option><option value="active">사용 중</option><option value="disabled">사용 중지</option></Select><Button variant="ghost" disabled={!query && filter==='all'} onClick={()=>{setQuery('');setFilter('all');}}>초기화</Button><span className="spacer"/><Button disabled={loading} onClick={refresh}>{loading?'불러오는 중…':'새로고침'}</Button></div>
    {error && <div className="alert error" role="alert">{error}<Button disabled={loading} onClick={refresh}>다시 불러오기</Button></div>}
    <div className="card table-wrap account-table-wrap" aria-busy={loading}>
      {loading ? <div className="account-loading" role="status">사용자 계정을 불러오고 있습니다…</div> : <><table className="data-table account-table"><thead><tr><th>사용자 / 아이디</th><th>권한</th><th>상태</th><th>가입일</th><th>최근 로그인</th><th>계정 관리</th></tr></thead><tbody>{visible.map(account=>{
        const self = account.id===currentUser.id, protectedAccount = self || account.username==='calla-admin';
        return <tr key={account.id}><td className="wide-cell"><strong>{account.name || account.username || account.email}</strong>{self&&<span className="account-self">내 계정</span>}<small className="secondary">{account.username || account.email}</small></td><td>{account.role==='admin'?'관리자':account.role==='viewer'?'조회 전용':'승인 전'}</td><td><Badge state={statusTone[account.status]}>{statusNames[account.status]}</Badge></td><td className="nowrap">{accountDate(account.createdAt)}</td><td className="nowrap">{accountDate(account.lastSignInAt)}</td><td><div className="account-row-actions"><Button onClick={()=>setEditor({user:account})}>{account.status==='pending'?'승인':'수정'}</Button><Button variant="ghost" disabled={protectedAccount} title={protectedAccount?'현재 계정과 최초 관리자 계정은 삭제할 수 없습니다.':undefined} onClick={()=>{setDeleting(account);setDeleteError('');}}>삭제</Button></div></td></tr>;
      })}</tbody></table>{!visible.length && <Empty title={users.length?'조건에 맞는 계정이 없습니다':'사용자 계정이 없습니다'} description={users.length?'검색어 또는 상태를 변경해 주세요.':'가입 신청을 받거나 계정을 직접 추가할 수 있습니다.'}/>}</>}
    </div>
    <div className="pagination"><span className="muted">{page}페이지 · {loading?'불러오는 중':`${users.length}개 계정${filter!=='all'||query?` 중 ${visible.length}개 표시`:''}`}</span><span className="spacer"/><Button disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>이전</Button><Button disabled={loading||!hasMore} onClick={()=>setPage(value=>value+1)}>다음</Button></div>
    <div className="alert account-access-notice"><Icon name="info"/><span>조회 전용 계정은 데이터 열람만 가능합니다. 추가·편집·삭제·저장·등록 작업은 관리자만 사용할 수 있습니다.</span></div><PageFooter><p>내 계정과 최초 관리자의 권한 및 사용 상태는 유지됩니다. 계정 수정에서 승인과 비밀번호 변경을 할 수 있습니다.</p><span className="spacer"/><span className="muted account-footer-identity">{currentUser.name || currentUser.username || currentUser.email} · 관리자</span></PageFooter>
    {editor && <AccountEditor account={editor.user} self={editor.user?.id===currentUser.id} onClose={()=>setEditor(null)} onSaved={saved}/>}
    {deleting && <Modal title="사용자 계정을 삭제할까요?" width={520} dismissible={!deleteBusy} onClose={()=>{if(!deleteLock.current)setDeleting(null);}} footer={<><ModalCloseButton disabled={deleteBusy}>취소</ModalCloseButton><Button variant="danger" disabled={deleteBusy} onClick={()=>void remove()}>{deleteBusy?'삭제 중…':'계정 삭제'}</Button></>}>
      {deleteError&&<div className="alert error" role="alert">{deleteError}</div>}<p><strong>{deleting.username || deleting.email}</strong> 계정과 로그인 권한이 영구 삭제됩니다. 삭제 후에는 되돌릴 수 없습니다.</p>
    </Modal>}
  </div>;
}

function AccountEditor({account, self, onClose, onSaved}: {account: ManagedUser | null; self: boolean; onClose: () => void; onSaved: (account: ManagedUser | null) => Promise<void>}) {
  const [username, setUsername] = useState(account?.username || ''), [name, setName] = useState(account?.name || '');
  const [role, setRole] = useState<Role>(account?.role || 'viewer'), [status, setStatus] = useState<AccountStatus>(account?.status==='pending'?'active':account?.status||'active');
  const [password, setPassword] = useState(''), [repeatPassword, setRepeatPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), formId = useId(), protectedAccount = self || account?.username==='calla-admin';
  const changed = !account || name.trim()!==account.name || (!protectedAccount && (role!==account.role || status!==account.status)) || !!password;
  const submit = async (event: FormEvent)=>{
    event.preventDefault(); if(lock.current)return;
    setError('');
    if (!name.trim()) { setError('이름을 입력해 주세요.'); return; }
    if (!account && !new RegExp(`^${USERNAME_PATTERN}$`).test(username)) { setError('아이디는 영문 소문자와 숫자로 시작하는 3~32자로 입력해 주세요.'); return; }
    if (password!==repeatPassword) { setError('비밀번호가 일치하지 않습니다.'); return; }
    lock.current=true; setBusy(true);
    try {
      if(account) await put(`/admin/users/${encodeURIComponent(account.id)}`, {...(name.trim()!==account.name?{name:name.trim()}:{}),...(!protectedAccount&&role!==account.role?{role}:{}),...(!protectedAccount&&status!==account.status?{status}:{}),...(password?{password}:{})});
      else await post('/admin/users', {username,name:name.trim(),password,role,status:'active'});
      await onSaved(account);
    } catch(failure) {setError((failure as Error).message);}
    finally {lock.current=false;setBusy(false);}
  };
  return <Modal title={account ? account.status==='pending'?'가입 신청 승인':'사용자 계정 수정' : '사용자 계정 추가'} subtitle={account?'이름, 권한, 사용 상태와 비밀번호를 변경할 수 있습니다.':'관리자가 추가한 계정은 바로 로그인할 수 있습니다.'} width={600} dismissible={!busy} onClose={()=>{if(!lock.current)onClose();}} footer={<><ModalCloseButton disabled={busy}>취소</ModalCloseButton><Button variant="primary" type="submit" form={formId} disabled={busy||!changed}>{busy?'저장 중…':account?.status==='pending'&&status==='active'?'승인하고 저장':'저장'}</Button></>}>
    <form id={formId} onSubmit={submit}><fieldset className="form-stack form-fieldset" disabled={busy}>
      {error&&<div className="alert error" role="alert">{error}</div>}
      <Field label="아이디" hint={account?'아이디는 변경할 수 없습니다.':'영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~32자'}><input type="text" required readOnly={!!account} autoComplete="off" autoCapitalize="none" spellCheck={false} pattern={account?undefined:USERNAME_PATTERN} maxLength={account?undefined:32} value={username||account?.email||''} onChange={e=>setUsername(e.target.value.toLowerCase())}/></Field>
      <Field label="이름"><input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} autoComplete="off" autoFocus/></Field>
      <div className="form-grid"><Field label="권한"><Select value={role} disabled={protectedAccount} onChange={e=>setRole(e.target.value as Role)}><option value="viewer">조회 전용</option><option value="admin">관리자</option></Select></Field>{account&&<Field label="사용 상태"><Select value={status} disabled={protectedAccount} onChange={e=>setStatus(e.target.value as AccountStatus)}><option value="active">사용 중</option><option value="pending">승인 대기</option><option value="disabled">사용 중지</option></Select></Field>}</div>
      {protectedAccount&&<p className="field-hint">현재 계정과 최초 관리자 계정의 관리자 권한, 사용 상태는 유지됩니다.</p>}
      <Field label={account?'새 비밀번호 (선택)':'비밀번호'} hint={account?'비워 두면 현재 비밀번호를 유지합니다. 입력하면 새 비밀번호로 변경됩니다.':'8자 이상으로 설정해 주세요.'}><input type="password" autoComplete="new-password" required={!account} minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>
      <Field label="비밀번호 확인"><input type="password" autoComplete="new-password" required={!account||!!password} minLength={password?8:undefined} maxLength={128} value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)}/></Field>
    </fieldset></form>
  </Modal>;
}
