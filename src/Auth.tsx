import { useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { DEMO, loginWithIdentifier, publicPost } from './api';
import { Button, Field, Logo } from './ui';
import type { Role } from './types';

export const USERNAME_PATTERN = '[a-z0-9][a-z0-9._-]{2,31}';
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
  const [identifier, setIdentifier] = useState(''), [name, setName] = useState('');
  const [password, setPassword] = useState(''), [repeatPassword, setRepeatPassword] = useState(''), [setupToken, setSetupToken] = useState('');
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
          : {username: identifier.trim(), name: name.trim(), password});
        setCreated(result.username || (settingUp ? 'calla-admin' : identifier.trim())); setPassword(''); setRepeatPassword(''); setSetupToken('');
      } else {
        await loginWithIdentifier(identifier, password); await onLogin();
      }
    } catch (failure) { setMessage((failure as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="login-page"><div className="login-card">
    <Logo/><span className="eyebrow">상품 등록 툴</span>
    <h1>{settingUp ? '첫 관리자 계정 만들기' : signingUp ? '계정 만들기' : '작업 공간에 로그인'}</h1>
    <p className="muted">{settingUp ? '최초 관리자 계정을 설정하고 사용자 계정을 관리하세요.' : signingUp ? '이메일 없이 원하는 아이디로 가입할 수 있습니다.' : <>상품 준비부터 고도몰 등록까지,<br/>한곳에서 관리하세요.</>}</p>
    {DEMO && <div className="alert">로컬 미리보기 · 예시 데이터만 사용합니다.</div>}
    {created ? <div className="auth-success" role="status">
      <span className="auth-success-mark" aria-hidden="true">✓</span><h2>{settingUp ? '관리자 계정을 만들었습니다' : '가입 신청을 완료했습니다'}</h2>
      <p>아이디 <strong>{created}</strong></p><p className="muted">{settingUp ? '이 아이디와 설정한 비밀번호로 로그인해 주세요.' : '관리자의 승인을 받은 후 로그인할 수 있습니다.'}</p>
      <Button variant="primary" onClick={()=>onNavigate('login')}>로그인으로 이동</Button>
    </div> : <form className="form-stack" onSubmit={submit}>
      <fieldset className="form-stack form-fieldset" disabled={busy}>
        {settingUp ? <>
          <Field label="관리자 아이디"><input value="calla-admin" readOnly autoComplete="username"/></Field>
          <Field label="초기 설정 토큰" hint="사이트 소유자가 설정한 초기 관리자 토큰을 입력해 주세요."><input type="password" required autoComplete="off" value={setupToken} onChange={e=>setSetupToken(e.target.value)} autoFocus/></Field>
        </> : <Field label={signingUp ? '아이디' : '아이디 또는 이메일'} hint={signingUp ? usernameHint : undefined}>
          <input type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} pattern={signingUp ? USERNAME_PATTERN : undefined} maxLength={signingUp ? 32 : 254} value={identifier} onChange={e=>setIdentifier(signingUp ? e.target.value.toLowerCase() : e.target.value)} autoFocus/>
        </Field>}
        {creating && <Field label="이름"><input required autoComplete="name" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></Field>}
        <Field label="비밀번호" hint={creating ? '8자 이상으로 설정해 주세요.' : undefined}><input autoComplete={creating ? 'new-password' : 'current-password'} type="password" required minLength={creating ? 8 : undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>
        {creating && <Field label="비밀번호 확인"><input autoComplete="new-password" type="password" required minLength={8} maxLength={128} value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)}/></Field>}
        <Button variant="primary" type="submit" disabled={busy}>{busy ? '처리 중…' : settingUp ? '관리자 계정 만들기' : signingUp ? '가입 신청' : '로그인'}</Button>
      </fieldset>
    </form>}
    {(message || (!creating && error)) && <div className="alert error" role="alert">{message || error}</div>}
    {!created && <div className="auth-links">{creating ? <>이미 계정이 있나요? <AuthLink page="login" onNavigate={onNavigate}>로그인</AuthLink></> : <>계정이 없나요? <AuthLink page="signup" onNavigate={onNavigate}>계정 만들기</AuthLink></>}</div>}
    {!creating && <div className="auth-links auth-setup-link"><AuthLink page="setup" onNavigate={onNavigate}>최초 관리자 계정 설정</AuthLink></div>}
    {settingUp && !created && <details className="auth-setup-help"><summary>초기 설정 토큰 안내</summary><p>Cloudflare Worker의 Variables and Secrets에 <code>CALLA_SETUP_TOKEN</code>을 Secret으로 저장한 후 같은 값을 입력해 주세요. 첫 관리자 계정 생성 후에는 이 페이지를 다시 사용할 수 없습니다.</p></details>}
    {!creating && DEMO && <div className="auth-preview"><Button onClick={()=>void onPreview('admin')}>관리자로 미리보기</Button><Button onClick={()=>void onPreview('viewer')}>뷰어로 미리보기</Button></div>}
    <small className="muted">{settingUp ? '첫 관리자 아이디는 calla-admin입니다.' : '가입한 계정은 관리자의 승인을 받은 후 사용할 수 있습니다.'}</small>
  </div><div className="login-caption">calla · Product workspace</div></div>;
}
