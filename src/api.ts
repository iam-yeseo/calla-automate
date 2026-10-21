import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User } from './types';
import { desktop } from './desktop';
export const DEMO = import.meta.env.DEV && import.meta.env.MODE === 'demo';
let client: SupabaseClient | undefined;
let previewRole: 'admin'|'viewer' = 'admin';
let previewUserId: string | undefined;
export function setPreviewRole(role:'admin'|'viewer') { previewRole=role; previewUserId=undefined; }
export async function authClient() {
  if(client) return client;
  const response=await fetch('/api/config');
  const config=await response.json() as {supabaseUrl?:string;url?:string;supabasePublishableKey?:string;publishableKey?:string;error?:string|{message?:string}};
  if(!response.ok) throw new Error(typeof config.error==='string'?config.error:config.error?.message || '서버 연결 설정이 필요합니다.');
  const url=config.supabaseUrl || config.url;
  const key=config.supabasePublishableKey || config.publishableKey;
  if(!url||!key)throw new Error('Supabase 인증 설정을 확인해 주세요.');
  client=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:!desktop,...(desktop?{storage:desktop.storage}:{})}});
  // A hidden macOS window must continue renewing the runner's login session.
  if(desktop) await client.auth.startAutoRefresh();
  return client;
}
export async function accessToken(): Promise<string> {
  if(DEMO) return 'local-preview-only';
  const {data,error}=await (await authClient()).auth.getSession();
  if(error||!data.session) throw new Error('로그인이 필요합니다.');
  return data.session.access_token;
}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
  if(DEMO){const {demoApi}=await import('./demo');return demoApi<T>(path,init,previewRole,previewUserId);}
  const token=await accessToken();
  const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${token}`);
  if(init.body&&!(init.body instanceof FormData))headers.set('Content-Type','application/json');
  const response=await fetch('/api'+path,{...init,headers,cache:'no-store'});
  const data=await response.json().catch(()=>({error:'서버 응답을 읽지 못했습니다.'})) as T & {error?:string|{message?:string}};
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:data.error?.message||'요청을 처리하지 못했습니다.');
  return data;
}
export async function currentUser():Promise<User>{
  const data=await api<{user:Omit<User,'role'> & {role?:User['role']};role?:User['role']}>('/me');
  const role=data.role||data.user.role;
  if(role!=='admin'&&role!=='viewer')throw new Error('사용 권한이 승인되지 않은 계정입니다.');
  return {...data.user,role};
}
export async function publicPost<T>(path:string,body:unknown):Promise<T>{
  if(DEMO){const {demoPublicApi}=await import('./demo');return demoPublicApi<T>(path,body);}
  const response=await fetch('/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({error:'서버 응답을 읽지 못했습니다.'})) as T & {error?:string|{message?:string}};
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:data.error?.message||'요청을 처리하지 못했습니다.');
  return data;
}
export async function loginWithIdentifier(identifier:string,password:string):Promise<void>{
  const session=await publicPost<{access_token:string;refresh_token:string;role?:User['role'];userId?:string}>('/auth/login',{identifier:identifier.trim(),password});
  if(DEMO){setPreviewRole(session.role==='viewer'?'viewer':'admin');previewUserId=session.userId;return;}
  const {error}=await (await authClient()).auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
  if(error)throw new Error('로그인 정보를 저장하지 못했습니다. 다시 로그인해 주세요.');
}
export const post=<T>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export const put=<T>(path:string,body:unknown)=>api<T>(path,{method:'PUT',body:JSON.stringify(body)});
