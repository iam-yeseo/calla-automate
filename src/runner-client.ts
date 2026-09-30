import { accessToken, DEMO } from './api';
import type { Channel, RunnerJob, RunnerStatus } from './types';
const BASE='http://127.0.0.1:8765';
let pairing='';
export function hasRunnerToken(){return !!pairing;}
export function clearRunnerToken(){pairing='';}
async function request<T>(path:string,body?:unknown):Promise<T>{
 if(DEMO)throw new Error('미리보기에서는 실제 Chrome 등록을 실행할 수 없습니다.');
 if(!pairing)throw new Error('동기화 설정에서 로컬 연결 프로그램을 연결해 주세요.');
 const headers:Record<string,string>={Authorization:`Bearer ${pairing}`};
 if(body)headers['Content-Type']='application/json';
 let response:Response;
 try{response=await fetch(BASE+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});}catch{throw new Error('로컬 연결 프로그램에 연결할 수 없습니다. 프로그램 실행과 Chrome의 로컬 네트워크 권한을 확인해 주세요.');}
 const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'로컬 실행 요청에 실패했습니다.');return data as T;
}
export async function connectRunner(token:string){pairing=token.trim();try{return await request<RunnerStatus>('/session',{origin:location.origin,accessToken:await accessToken()});}catch(e){pairing='';throw e;}}
export async function refreshRunner(){await request('/session',{origin:location.origin,accessToken:await accessToken()});return request<RunnerStatus>('/status');}
export const runnerStatus=()=>request<RunnerStatus>('/status');
export const startJob=async(listId:string,itemIds:string[],channels:Channel[],dryRun:boolean,idempotencyKey:string)=>{
 await request('/session',{origin:location.origin,accessToken:await accessToken()});
 return request<{job:RunnerJob}>('/jobs',{listId,itemIds,channels,dryRun,idempotencyKey});
};
export const continueJob=(id:string)=>request<{job:RunnerJob}>(`/jobs/${id}/continue`,{});
export const stopJob=(id:string)=>request<{job:RunnerJob}>(`/jobs/${id}/stop`,{});
