import type { Product, ProductList, Registration, Role, Settings } from './types';
import defaults from './data/automation-settings.json';
import {newProduct,today} from './domain';
const STORE='calla-local-preview-v1';
type DemoDB={lists:ProductList[];items:Product[];registrations:Registration[];settings:Settings;revision:string};
function seed():DemoDB{
 const date=today(),lists=['260930-중고 상품 리스트','9월 신제품 등록','오디오 액세서리 추가','TILTA 리깅 제품'].map((title,i)=>({id:`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`,title,author:'임예서',work_date:date,created_at:new Date(Date.now()-i*86400000).toISOString(),note:''}));
 const sample=[['AVMATRIX','PTZ1271-12A','PTZ 카메라',1290000],['ROXTONE','PSS130','오디오 케이블',32000],['HOLLYLAND','LARK M2','무선 마이크',198000],['TILTA','TA-T01','카메라 리그',124000],['MACKIE','ProFX6v3','오디오 믹서',289000]] as const;
 const settings=structuredClone(defaults) as Settings;
 const items=lists.flatMap((list,li)=>sample.slice(0,li===0?5:4).map(([brand,model,label,price],i)=>{
  const p=newProduct(list.id,i+1);p.id=`22222222-2222-4222-8222-${String(li*10+i+1).padStart(12,'0')}`;p.brand=brand;p.model=model;p.name_own=`${brand} ${model} ${label}`;p.name_naver=p.name_own;p.price_retail=price;p.price_retail_regular=Math.round(price*1.2);p.price_wholesale=Math.round(price*.72);p.price_wholesale_master=Math.round(price*.68);p.price_naver=price;p.done=li===0;p.done_at=li===0?new Date().toISOString():null;p.automation.origin='중국';return p;
 }));
 const registrations:Registration[]=items.filter(p=>p.done).flatMap((p,i)=>['retail','wholesale'].map(channel=>({item_id:p.id,channel:channel as Registration['channel'],status:'success',goods_no:String(1000008200+i),attempted_at:new Date().toISOString()})));
 return{lists,items,registrations,settings,revision:new Date().toISOString()};
}
function read():DemoDB{try{const raw=localStorage.getItem(STORE);if(raw)return JSON.parse(raw);}catch{}const db=seed();localStorage.setItem(STORE,JSON.stringify(db));return db;}
export async function demoApi<T>(path:string,init:RequestInit,role:Role):Promise<T>{
 await new Promise(r=>setTimeout(r,130));
 const db=read(), method=init.method||'GET',url=new URL(path,'http://preview');
 if(role==='viewer'&&method!=='GET')throw new Error('뷰어는 조회만 할 수 있습니다.');
 let body:Record<string,unknown>={};if(typeof init.body==='string')body=JSON.parse(init.body);
 const summary=(l:ProductList)=>{const items=db.items.filter(p=>p.list_id===l.id),regs=db.registrations.filter(r=>items.some(p=>p.id===r.item_id));return{...l,total:items.length,doneCount:items.filter(p=>p.done).length,retailSuccess:regs.filter(r=>r.channel==='retail'&&r.status==='success').length,wholesaleSuccess:regs.filter(r=>r.channel==='wholesale'&&r.status==='success').length,retailTotal:items.filter(p=>p.need_retail==='필요').length,wholesaleTotal:items.filter(p=>p.need_wholesale==='필요').length,runningCount:regs.filter(r=>r.status==='running').length,failedCount:regs.filter(r=>r.status==='failed').length};};
 let result:unknown;
 if(path==='/me')result={user:{id:'preview-user',email:role==='admin'?'admin@preview.local':'viewer@preview.local'},role};
 else if(path==='/lists'&&method==='GET')result={lists:db.lists.map(summary)};
 else if(path==='/lists'&&method==='POST'){const list={id:crypto.randomUUID(),title:body.title||'새 리스트',author:body.author||'',note:body.note||'',work_date:body.work_date||today(),created_at:new Date().toISOString()} as ProductList;db.lists.unshift(list);result={list};}
 else if(path==='/settings'&&method==='GET')result={value:db.settings,updated_at:db.revision};
 else if(path==='/settings'&&method==='PUT'){if(body.revision!==db.revision)throw new Error('설정이 변경되었습니다. 새로 불러와 주세요.');db.settings=body.value as Settings;db.revision=new Date().toISOString();result={value:db.settings,updated_at:db.revision};}
 else if(url.pathname==='/catalog'){const term=(url.searchParams.get('q')||'').toLowerCase(),offset=Number(url.searchParams.get('offset')||0);const items=db.items.filter(p=>[p.name_own,p.brand,p.model].join(' ').toLowerCase().includes(term));result={items:items.slice(offset,offset+50),total:items.length,nextOffset:offset+50<items.length?offset+50:null};}
 else if(/^\/items\/[^/]+\/completion$/.test(url.pathname)&&method==='POST'){
  if(typeof body.done!=='boolean')throw new Error('완료 여부를 확인해 주세요.');
  const item=db.items.find(p=>p.id===url.pathname.split('/')[2]);if(!item)throw new Error('상품을 찾을 수 없습니다.');
  if(item.done!==body.done){item.done=body.done;item.done_at=body.done?new Date().toISOString():null;}
  result={item};
 }
 else if(/^\/lists\//.test(path)){
  const [, , id,action]=path.split('/'),list=db.lists.find(l=>l.id===id);if(!list)throw new Error('리스트를 찾을 수 없습니다.');
  if(action==='items')result={items:db.items.filter(p=>p.list_id===id)};
  else if(action==='registrations')result={registrations:db.registrations.filter(r=>db.items.some(p=>p.id===r.item_id&&p.list_id===id))};
  else if(action==='draft'&&method==='PUT'){Object.assign(list,body.list);const incoming=body.items as Product[],old=new Map(db.items.filter(p=>p.list_id===id).map(p=>[p.id,p]));db.items=db.items.filter(p=>p.list_id!==id).concat(incoming.map(p=>({...p,done:old.get(p.id)?.done||false,done_at:old.get(p.id)?.done_at||null})));result={ok:true};}
  else if(method==='DELETE'){db.lists=db.lists.filter(l=>l.id!==id);const ids=new Set(db.items.filter(p=>p.list_id===id).map(p=>p.id));db.items=db.items.filter(p=>p.list_id!==id);db.registrations=db.registrations.filter(r=>!ids.has(r.item_id));result={ok:true};}
  else result={list};
 }else throw new Error('미리보기에서는 이 기능을 사용할 수 없습니다. 실제 연결 후 이용해 주세요.');
 if(method!=='GET')localStorage.setItem(STORE,JSON.stringify(db));return result as T;
}
