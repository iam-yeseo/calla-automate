import core from './lib/automation-core.js';
import type { Product, ProductList, Registration, Settings } from './types';
export { core };
export const CHANNELS = [{key:'retail',label:'고도몰 소매'}, {key:'wholesale',label:'고도몰 도매'}] as const;
export const money = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('ko-KR');
export const dateText = (value?: string | null) => value ? value.slice(0,10).replaceAll('-', '/') : '—';
export const today = () => new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'});
export function newProduct(listId: string, seq: number): Product {
  return {id:crypto.randomUUID(),list_id:listId,seq,brand:'',name_own:'',name_naver:'',model:'',content:'',image_usage:'',need_retail:'필요',need_wholesale:'필요',need_naver:'불필요',price_retail_regular:null,price_retail:null,price_wholesale:null,price_wholesale_master:null,price_naver:null,image_url:'',ref_link:'',note:'',automation:core.normalize({}),done:false,done_at:null};
}
export function duplicateProduct(product: Product, listId = product.list_id): Product {
  const copy=structuredClone(product);
  // Owned uploads are deleted by the legacy completion cleanup. A copied item
  // must not depend on the original item's expiring thumbnail.
  if(copy.automation.thumbnail?.path || /\/storage\/v1\/object\/public\/product-thumbnails\//.test(copy.image_url || copy.automation.thumbnail?.url || '')) {
    copy.image_url='';
    copy.automation.thumbnail={};
  }
  return {...copy,id:crypto.randomUUID(),list_id:listId,done:false,done_at:null,created_at:undefined,updated_at:undefined,automation:core.normalize(copy.automation)};
}
export function prepareDraft(items: Product[]): Record<string, unknown>[] {
  return items.map((item,index)=>{
    const {done: _done,done_at: _at,created_at: _created,updated_at: _updated,...editable}=item;
    return {...editable,seq:index+1,automation:core.withDetailBlocks(core.normalize(item.automation),core.detailBlocks(item.automation))};
  });
}
export function listState(list: ProductList): 'success'|'running'|'warning'|'pending' {
  if(list.failedCount) return 'warning';
  if(list.runningCount) return 'running';
  // API registration and manual completion are independent; either can finish a list.
  const { retailTotal, wholesaleTotal } = list;
  const registered = typeof retailTotal === 'number' && typeof wholesaleTotal === 'number'
    && retailTotal + wholesaleTotal > 0
    && (list.retailSuccess ?? 0) === retailTotal && (list.wholesaleSuccess ?? 0) === wholesaleTotal;
  if(list.total && (list.doneCount === list.total || registered)) return 'success';
  return 'pending';
}
export function canRun(item: Product, registrations: Registration[], settings: Settings): boolean {
  if(item.done || core.readyIssues(item,settings).length) return false;
  return CHANNELS.some(({key})=>item[`need_${key}`]==='필요'&&!registrations.some(r=>r.item_id===item.id&&r.channel===key&&(r.status==='success'||r.status==='running')));
}
export function automationPayload(listId: string, items: Product[], settings: Settings, saved: boolean) {
  return {schemaVersion:1,ready:true,saved,listId,items:items.map(item=>core.exportItem(item,settings))};
}
export function parsePrice(value: string): number | null {
  const clean=value.replaceAll(',','').trim();
  if(!clean) return null;
  const n=Number(clean);
  if(!Number.isSafeInteger(n)||n<0) throw new Error('가격은 0 이상의 정수로 입력해 주세요.');
  return n;
}

export function supportsProductSetup(version?: string): boolean {
  const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(version||'');
  return !!match&&(Number(match[1])>1||(Number(match[1])===1&&Number(match[2])>=1));
}
