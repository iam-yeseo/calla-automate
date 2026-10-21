import type { ManagedUser, Product, ProductList, Registration, Role, Settings } from './types';
import defaults from './data/automation-settings.json';
import {newProduct,today} from './domain';
const STORE='calla-local-preview-v1';
type DemoDB={lists:ProductList[];items:Product[];registrations:Registration[];settings:Settings;revision:string;users:ManagedUser[]};
// Passwords entered in the preview stay in memory and never reach the production API.
const previewPasswords=new Map<string,string>();
function seedUsers():ManagedUser[]{
 const now=new Date().toISOString();
 return [
  {id:'preview-admin',username:'calla-admin',name:'임예서',email:'',role:'admin',status:'active',createdAt:now,lastSignInAt:now},
  {id:'preview-viewer',username:'demo-viewer',name:'상품 조회자',email:'',role:'viewer',status:'active',createdAt:now,lastSignInAt:now},
  {id:'preview-pending',username:'new-member',name:'가입 신청자',email:'',role:null,status:'pending',createdAt:now,lastSignInAt:null},
  {id:'preview-disabled',username:'paused-member',name:'사용 중지 계정',email:'',role:'viewer',status:'disabled',createdAt:now,lastSignInAt:null},
 ];
}
function seed():DemoDB{
 const date=today(),lists=['260930-중고 상품 리스트','9월 신제품 등록','오디오 액세서리 추가','TILTA 리깅 제품'].map((title,i)=>({id:`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`,title,author:'임예서',work_date:date,created_at:new Date(Date.now()-i*86400000).toISOString(),note:''}));
 const sample=[['AVMATRIX','PTZ1271-12A','PTZ 카메라',1290000],['ROXTONE','PSS130','오디오 케이블',32000],['HOLLYLAND','LARK M2','무선 마이크',198000],['TILTA','TA-T01','카메라 리그',124000],['MACKIE','ProFX6v3','오디오 믹서',289000]] as const;
 const settings=structuredClone(defaults) as Settings;
 const items=lists.flatMap((list,li)=>sample.slice(0,li===0?5:4).map(([brand,model,label,price],i)=>{
  const p=newProduct(list.id,i+1);p.id=`22222222-2222-4222-8222-${String(li*10+i+1).padStart(12,'0')}`;p.brand=brand;p.model=model;p.name_own=`${brand} ${model} ${label}`;p.name_naver=p.name_own;p.price_retail=price;p.price_retail_regular=Math.round(price*1.2);p.price_wholesale=Math.round(price*.72);p.price_wholesale_master=Math.round(price*.68);p.price_naver=price;p.done=li===0;p.done_at=li===0?new Date().toISOString():null;p.automation.origin='중국';return p;
 }));
 const registrations:Registration[]=items.filter(p=>p.done).flatMap((p,i)=>['retail','wholesale'].map(channel=>({item_id:p.id,channel:channel as Registration['channel'],status:'success',goods_no:String(1000008200+i),attempted_at:new Date().toISOString()})));
 return{lists,items,registrations,settings,revision:new Date().toISOString(),users:seedUsers()};
}
function read():DemoDB{try{const raw=localStorage.getItem(STORE);if(raw){const db=JSON.parse(raw) as DemoDB;if(!Array.isArray(db.users))db.users=seedUsers();return db;}}catch{}const db=seed();localStorage.setItem(STORE,JSON.stringify(db));return db;}
function demoCredentials(body:Record<string,unknown>){
 const username=String(body.username||'').trim().toLowerCase(),name=String(body.name||'').trim(),password=String(body.password||'');
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))throw new Error('아이디 형식을 확인해 주세요.');
 if(!name||name.length>80)throw new Error('이름은 1~80자로 입력해 주세요.');
 if(password.length<8||password.length>128)throw new Error('비밀번호는 8~128자로 입력해 주세요.');
 return {username,name,password};
}
export async function demoPublicApi<T>(path:string,value:unknown):Promise<T>{
 await new Promise(r=>setTimeout(r,130));
 const db=read(),body=value as Record<string,unknown>;let result:unknown;
 if(path==='/auth/login'){
  const identifier=String(body.identifier||'').trim().toLowerCase(),account=db.users.find(user=>user.username===identifier||!!user.email&&user.email===identifier);
  if(!account||String(body.password||'')!==(previewPasswords.get(account.id)||'preview1234'))throw new Error('아이디 또는 비밀번호를 확인해 주세요.');
  if(account.status==='pending'||!account.role)throw new Error('사용 권한이 승인되지 않은 계정입니다.');
  if(account.status==='disabled')throw new Error('사용 중지된 계정입니다. 관리자에게 문의해 주세요.');
  account.lastSignInAt=new Date().toISOString();result={access_token:'local-preview-only',refresh_token:'local-preview-only',role:account.role,userId:account.id};
 }else if(path==='/auth/signup'){
  const credentials=demoCredentials(body);if(credentials.username==='calla-admin'||db.users.some(user=>user.username===credentials.username))throw new Error('이미 사용 중인 아이디입니다.');
  const account:ManagedUser={id:crypto.randomUUID(),username:credentials.username,name:credentials.name,email:'',role:null,status:'pending',createdAt:new Date().toISOString(),lastSignInAt:null};
  db.users.unshift(account);previewPasswords.set(account.id,credentials.password);result={username:account.username};
 }else if(path==='/auth/setup'){
  if(!String(body.setupToken||'').trim())throw new Error('초기 설정 토큰을 입력해 주세요.');
  const credentials=demoCredentials({...body,username:'calla-admin'});const account=db.users.find(user=>user.username==='calla-admin');
  if(account){account.name=credentials.name;account.role='admin';account.status='active';previewPasswords.set(account.id,credentials.password);}
  result={username:'calla-admin'};
 }else throw new Error('미리보기에서 지원하지 않는 인증 요청입니다.');
 localStorage.setItem(STORE,JSON.stringify(db));return result as T;
}
export async function demoApi<T>(path:string,init:RequestInit,role:Role,previewUserId?:string):Promise<T>{
 await new Promise(r=>setTimeout(r,130));
 const db=read(), method=init.method||'GET',url=new URL(path,'http://preview');
 if(role==='viewer'&&method!=='GET')throw new Error('뷰어는 조회만 할 수 있습니다.');
 let body:Record<string,unknown>={};if(typeof init.body==='string')body=JSON.parse(init.body);
 const summary=(l:ProductList)=>{const items=db.items.filter(p=>p.list_id===l.id),regs=db.registrations.filter(r=>items.some(p=>p.id===r.item_id));return{...l,total:items.length,doneCount:items.filter(p=>p.done).length,retailSuccess:regs.filter(r=>r.channel==='retail'&&r.status==='success').length,wholesaleSuccess:regs.filter(r=>r.channel==='wholesale'&&r.status==='success').length,retailTotal:items.filter(p=>p.need_retail==='필요').length,wholesaleTotal:items.filter(p=>p.need_wholesale==='필요').length,runningCount:regs.filter(r=>r.status==='running').length,failedCount:regs.filter(r=>r.status==='failed').length};};
 let result:unknown;
 if(url.pathname.startsWith('/godomall/')) {
  if(url.pathname==='/godomall/connections')return {connections: ['retail','wholesale'].map(mallId=>({mallId,configured:false,connected:false,checkedAt:null,message:'개발 미리보기: 실제 고도몰 API에 연결하지 않습니다.'}))} as T;
  if(url.pathname.endsWith('/operations')&&method==='GET')return {operations:[],nextOffset:null} as T;
  throw new Error('개발 미리보기에서는 실제 고도몰 API 조회·전송을 실행하지 않습니다.');
 }
 if(path==='/me'){const account=db.users.find(user=>user.id===(previewUserId||(role==='admin'?'preview-admin':'preview-viewer')));if(!account||account.status!=='active'||!account.role)throw new Error('사용 권한이 승인되지 않은 계정입니다.');result={user:{id:account.id,email:account.email,username:account.username,name:account.name},role:account.role};}
 else if(url.pathname==='/admin/users'){
  if(role!=='admin')throw new Error('관리자만 접근할 수 있습니다.');
  if(method==='GET'){const page=Math.max(1,Number(url.searchParams.get('page')||1)),offset=(page-1)*50;result={users:db.users.slice(offset,offset+50),page,hasMore:offset+50<db.users.length};}
  else if(method==='POST'){const credentials=demoCredentials(body);if(credentials.username==='calla-admin'||db.users.some(user=>user.username===credentials.username))throw new Error('이미 사용 중인 아이디입니다.');const account:ManagedUser={id:crypto.randomUUID(),username:credentials.username,name:credentials.name,email:'',role:body.role==='admin'?'admin':'viewer',status:'active',createdAt:new Date().toISOString(),lastSignInAt:null};db.users.unshift(account);previewPasswords.set(account.id,credentials.password);result={user:account};}
  else throw new Error('지원하지 않는 요청입니다.');
 }
 else if(/^\/admin\/users\/[^/]+$/.test(url.pathname)){
  if(role!=='admin')throw new Error('관리자만 접근할 수 있습니다.');
  const account=db.users.find(user=>user.id===decodeURIComponent(url.pathname.split('/')[3]));if(!account)throw new Error('계정을 찾을 수 없습니다.');
  const protectedAccount=account.id===(previewUserId||'preview-admin')||account.username==='calla-admin';
  if(method==='DELETE'){if(protectedAccount)throw new Error('현재 계정과 최초 관리자 계정은 삭제할 수 없습니다.');db.users=db.users.filter(user=>user.id!==account.id);previewPasswords.delete(account.id);result={ok:true};}
  else if(method==='PUT'){
   if(protectedAccount&&(('role'in body&&body.role!==account.role)||('status'in body&&body.status!==account.status)))throw new Error('이 계정의 권한과 사용 상태는 변경할 수 없습니다.');
   if('name'in body){const name=String(body.name||'').trim();if(!name||name.length>80)throw new Error('이름을 확인해 주세요.');account.name=name;}
   if(body.role==='admin'||body.role==='viewer')account.role=body.role;
   if(body.status==='active'||body.status==='pending'||body.status==='disabled')account.status=body.status;
   if(body.password){const password=String(body.password);if(password.length<8||password.length>128)throw new Error('비밀번호는 8~128자로 입력해 주세요.');previewPasswords.set(account.id,password);}
   result={user:account};
  }else throw new Error('지원하지 않는 요청입니다.');
 }
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
