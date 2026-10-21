import { useEffect, useRef, useState, type RefObject } from 'react';
import { installHistoryMouseButtons } from './navigation';

type Route={page:string;listId:string|null;view:boolean};
function readRoute():Route{const path=location.pathname.split('/').filter(Boolean)[0]||'requests';return {page:['edit','view','requests'].includes(path)?'requests':path,listId:new URLSearchParams(location.search).get('list'),view:path==='view'};}
type Options={
 dirty:boolean;
 registrationBusy:boolean;
 savingLock:RefObject<boolean>;
 confirmLock:RefObject<boolean>;
 duplicateLock:RefObject<boolean>;
 creatingLock:RefObject<boolean>;
 clearDraft:()=>void;
 setConfirm:(confirmation:{title:string;description:string;action:()=>Promise<void>}|null)=>void;
 onNavigate:(route:Route)=>void;
};
const HISTORY_KEY='__callaHistoryIndex';
const currentUrl=()=>location.pathname+location.search+location.hash;
const historyIndex=(state:unknown):number|null=>{const value=(state as Record<string,unknown>|null)?.[HISTORY_KEY];return typeof value==='number'&&Number.isFinite(value)?value:null;};

export function useNavigation({dirty,registrationBusy,savingLock,confirmLock,duplicateLock,creatingLock,clearDraft,setConfirm,onNavigate}:Options){
 const [route,setRoute]=useState(readRoute);
 const historyCommand=useRef<(direction:-1|1)=>void>(()=>{});
 const navigation=useRef({index:historyIndex(history.state)??0,url:currentUrl()});
 const restoring=useRef<{after:()=>void}|null>(null),allowedTraversal=useRef<number|null>(null),popHandler=useRef<(event:PopStateEvent)=>void>(()=>{});
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty||registrationBusy||savingLock.current||confirmLock.current||duplicateLock.current||creatingLock.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,registrationBusy]);
 useEffect(()=>{history.replaceState({...history.state,[HISTORY_KEY]:navigation.current.index},'',navigation.current.url);const handler=(event:PopStateEvent)=>popHandler.current(event);window.addEventListener('popstate',handler);return()=>window.removeEventListener('popstate',handler);},[]);
 useEffect(()=>installHistoryMouseButtons(window,direction=>historyCommand.current(direction)),[]);
 historyCommand.current=direction=>{if(restoring.current||savingLock.current||confirmLock.current||duplicateLock.current||creatingLock.current||registrationBusy||document.querySelector('dialog[open]'))return;history.go(direction);};
 function applyNavigation(index:number){navigation.current={index,url:currentUrl()};clearDraft();setRoute(readRoute());onNavigate(readRoute());}
 function requestDiscard(action:()=>void,description='페이지를 이동하면 현재 초안이 사라집니다. 변경사항을 버리고 이동할까요?'){
  if(registrationBusy||savingLock.current||confirmLock.current||duplicateLock.current||creatingLock.current||restoring.current)return;
  if(dirty)setConfirm({title:'저장하지 않은 변경사항이 있습니다',description,action:async()=>action()});else action();
 }
 popHandler.current=event=>{
  const previous=navigation.current,targetUrl=currentUrl();let targetIndex=historyIndex(event.state);
  if(restoring.current){
   if(targetIndex===previous.index){const after=restoring.current.after;restoring.current=null;after();}
   else if(targetIndex!==null)history.go(previous.index-targetIndex);
   return;
  }
  if(allowedTraversal.current!==null&&targetIndex===allowedTraversal.current){allowedTraversal.current=null;applyNavigation(targetIndex);return;}
  const blocked=registrationBusy||savingLock.current||confirmLock.current||duplicateLock.current||creatingLock.current||!!document.querySelector('dialog[open]');
  if(!dirty&&!blocked){targetIndex??=previous.index-1;history.replaceState({...history.state,[HISTORY_KEY]:targetIndex},'',targetUrl);applyNavigation(targetIndex);return;}
  // Restore the accepted entry before asking. Cancelling never changes the draft or URL.
  const after=()=>{if(blocked)return;requestDiscard(()=>{allowedTraversal.current=targetIndex;setConfirm(null);history.go(targetIndex!-previous.index);});};
  if(targetIndex===null||targetIndex===previous.index){
   // Older entries created before this app session do not have an index yet.
   targetIndex=previous.index-1;history.replaceState({...history.state,[HISTORY_KEY]:targetIndex},'',targetUrl);
   history.pushState({[HISTORY_KEY]:previous.index},'',previous.url);after();
  }else{restoring.current={after};history.go(previous.index-targetIndex);}
 };
 function go(pageName:string,id?:string){
  const url=id?`/edit/?list=${encodeURIComponent(id)}`:pageName==='requests'?'/':`/${pageName}/`;
  if(url===navigation.current.url)return;
  requestDiscard(()=>{const index=navigation.current.index+1;history.pushState({[HISTORY_KEY]:index},'',url);applyNavigation(index);});
 }
 return {route,go,requestDiscard,historyCommand,restoring};
}
