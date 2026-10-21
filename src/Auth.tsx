import { useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { DEMO, loginWithIdentifier, publicPost } from './api';
import { Badge, Button, Field, Icon, Logo } from './ui';
import './settings-redesign.css';
import type { Role } from './types';

export const USERNAME_PATTERN = '[a-z0-9][a-z0-9._-]{2,31}';
const rememberedIdentifierKey = 'calla-remembered-identifier';
function rememberedIdentifier() { try { return localStorage.getItem(rememberedIdentifierKey) || ''; } catch { return ''; } }
const usernameHint = '영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~32자';

function AuthLink({ page, onNavigate, children }: { page: string; onNavigate: (page: string) => void; children: ReactNode }) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(page);
  };
  return <a href={`/${page}/`} onClick={follow}>{children}</a>;
}

export default function Auth({ page, error, onLogin, onPreview, onNavigate }: {
  page: 'login' | 'signup' | 'setup'; error: string; onLogin: () => Promise<void>;
  onPreview: (role: Role) => Promise<void>; onNavigate: (page: string) => void;
}) {
  const [identifier, setIdentifier] = useState(() => page === 'login' ? rememberedIdentifier() : ''), [name, setName] = useState('');
  const [remember, setRemember] = useState(() => !!rememberedIdentifier());
  const [password, setPassword] = useState(''), [repeatPassword, setRepeatPassword] = useState(''), [setupToken, setSetupToken] = useState(''), [signupCode, setSignupCode] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [created, setCreated] = useState('');
  const lock = useRef(false);
  const signingUp = page === 'signup', settingUp = page === 'setup', creating = signingUp || settingUp;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (lock.current) return;
    setMessage('');
    if (creating && password !== repeatPassword) { setMessage('비밀번호가 일치하지 않습니다.'); return; }
    if (signingUp && !new RegExp(`^${USERNAME_PATTERN}$`).test(identifier.trim())) { setMessage('아이디는 영문 소문자와 숫자로 시작하는 3~32자로 입력해 주세요.'); return; }
    if (creating && (!name.trim() || name.trim().length > 80)) { setMessage('이름은 1~80자로 입력해 주세요.'); return; }
    lock.current = true; setBusy(true);
    try {
      if (creating) {
        const result = await publicPost<{username: string}>(settingUp ? '/auth/setup' : '/auth/signup', settingUp
          ? {setupToken: setupToken.trim(), name: name.trim(), password}
          : {username: identifier.trim(), name: name.trim(), password, signupCode: signupCode.trim()});
        setCreated(result.username || (settingUp ? 'calla-admin' : identifier.trim())); setPassword(''); setRepeatPassword(''); setSetupToken(''); setSignupCode('');
      } else {
        await loginWithIdentifier(identifier, password);
        try { if (remember) localStorage.setItem(rememberedIdentifierKey, identifier.trim()); else localStorage.removeItem(rememberedIdentifierKey); } catch { /* Login remains available when storage is restricted. */ }
        await onLogin();
      }
    } catch (failure) { setMessage((failure as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const authFailure = message || (!creating ? error : '');
  const passwordMismatch = !!repeatPassword && password !== repeatPassword;
  return <div className="login-page auth-redesign">
    <header className="auth-header"><Logo/><span>AUTOMATE · 계정</span></header>
    <main className="auth-workspace"><div className="login-card">
      <div className="auth-heading"><h1>{created ? settingUp ? '관리자 계정을 만들었습니다' : '관리자 승인을 기다리고 있습니다' : settingUp ? '첫 관리자 계정 만들기' : signingUp ? '회원가입' : '로그인'}</h1>
        <p className="muted">{created ? settingUp ? '이 아이디와 설정한 비밀번호로 로그인해 주세요.' : '가입 신청이 접수되었습니다. 승인 완료 후 다시 로그인하세요.' : settingUp ? '최초 관리자 계정을 설정하고 사용자 계정을 관리하세요.' : signingUp ? '관리자 승인 후 계정 권한에 맞는 업무를 이용할 수 있습니다.' : '승인된 계정으로 상품 운영 업무에 접속하세요.'}</p>
      </div>
      {DEMO && <div className="alert auth-notice"><Icon name="info"/><span>로컬 미리보기 · 예시 데이터만 사용합니다.</span></div>}
      {created ? <div className="auth-approval" role="status">
        <Badge state={settingUp ? 'connected' : 'warning'}>{settingUp ? '계정 생성 완료' : '승인 대기'}</Badge>
        <dl className="auth-account-details"><div><dt>이름</dt><dd>{name}</dd></div><div><dt>아이디</dt><dd>{created}</dd></div></dl>
        {!settingUp && <div className="alert auth-notice warning"><Icon name="info"/><span>승인 전에는 상품 운영에 접근할 수 없습니다. 상품 조회·편집·등록도 사용할 수 없습니다.</span></div>}
        <Button variant="primary" onClick={()=>onNavigate('login')}>로그인으로 이동</Button>
        <p className="auth-footnote">{settingUp ? '최초 관리자 계정으로 사용자 계정을 관리할 수 있습니다.' : '승인 문의 · 계정 관리자에게 이름과 신청 아이디를 알려주세요.'}</p>
      </div> : <form className="form-stack auth-form" onSubmit={submit}>
        <fieldset className="form-stack form-fieldset" disabled={busy}>
          {creating && <Field label="이름"><input required autoComplete="name" maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="이름을 입력하세요" autoFocus={creating}/></Field>}
          {settingUp ? <>
            <Field label="관리자 아이디"><input value="calla-admin" readOnly autoComplete="username"/></Field>
            <Field label="초기 설정 토큰" hint="사이트 소유자가 설정한 초기 관리자 토큰을 입력해 주세요."><input type="password" required autoComplete="off" value={setupToken} onChange={e=>setSetupToken(e.target.value)}/></Field>
          </> : <Field label={signingUp ? '아이디' : '아이디 또는 이메일'} hint={signingUp ? usernameHint : undefined}>
            <input type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} pattern={signingUp ? USERNAME_PATTERN : undefined} maxLength={signingUp ? 32 : 254} value={identifier} onChange={e=>setIdentifier(signingUp ? e.target.value.toLowerCase() : e.target.value)} placeholder={signingUp ? '사용할 아이디를 입력하세요' : '아이디 또는 이메일을 입력하세요'} autoFocus={!creating}/>
          </Field>}
          {signingUp && <Field label="가입 코드" hint="관리자에게 받은 가입 코드를 입력해 주세요."><input type="password" required autoComplete="off" maxLength={512} value={signupCode} onChange={e=>setSignupCode(e.target.value)}/></Field>}
          <Field label="비밀번호" hint={creating ? '8자 이상으로 설정해 주세요.' : undefined}><input autoComplete={creating ? 'new-password' : 'current-password'} type="password" required minLength={creating ? 8 : undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="비밀번호를 입력하세요"/></Field>
          {creating && <Field label="비밀번호 확인" hint={passwordMismatch ? <span className="field-error">비밀번호가 일치하지 않습니다. 다시 입력하세요.</span> : undefined}><input autoComplete="new-password" type="password" required minLength={8} maxLength={128} value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)} placeholder="비밀번호를 다시 입력하세요" aria-invalid={passwordMismatch || undefined}/></Field>}
          {authFailure && <div className="alert error auth-notice" role="alert"><Icon name="info"/><span>{authFailure}</span></div>}
          {!creating && <label className="auth-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>아이디 기억하기</label>}
          {signingUp && <div className="alert auth-notice"><Icon name="info"/><span>가입 신청은 승인 대기로 접수됩니다. 관리자가 승인하기 전에는 상품 조회·편집·등록이 제한됩니다.</span></div>}
          <Button variant="primary" type="submit" disabled={busy}>{busy ? '처리 중…' : settingUp ? '관리자 계정 만들기' : signingUp ? '가입 신청' : '로그인'}</Button>
        </fieldset>
      </form>}
      {!created && <div className={`auth-links ${creating ? 'auth-return-link' : ''}`}>{creating ? <AuthLink page="login" onNavigate={onNavigate}>로그인으로 돌아가기</AuthLink> : <><AuthLink page="signup" onNavigate={onNavigate}>회원가입</AuthLink><AuthLink page="setup" onNavigate={onNavigate}>최초 관리자 계정 설정</AuthLink></>}</div>}
      {settingUp && !created && <details className="auth-setup-help"><summary>초기 설정 토큰 안내</summary><p>Cloudflare Worker의 Variables and Secrets에 <code>CALLA_SETUP_TOKEN</code>을 Secret으로 저장한 후 같은 값을 입력해 주세요. 첫 관리자 계정 생성 후에는 이 페이지를 다시 사용할 수 없습니다.</p></details>}
      {!creating && DEMO && <div className="auth-preview"><Button onClick={()=>void onPreview('admin')}>관리자로 미리보기</Button><Button onClick={()=>void onPreview('viewer')}>뷰어로 미리보기</Button></div>}
      {!created && !signingUp && <p className="auth-footnote">{settingUp ? '첫 관리자 아이디는 calla-admin입니다.' : '가입 후 관리자 승인 전에는 상품 운영 화면에 접근할 수 없습니다.'}</p>}
    </div><div className="login-caption">CALLA-AUTOMATE · 상품 운영 작업 공간</div></main>
  </div>;
}
