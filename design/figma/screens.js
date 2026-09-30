function round(n,r=12){n.cornerRadius=r;bind(n,'cornerRadius','radius/'+r);return n;}
function stroke(n,k='border/default'){n.strokes=[paint(k)];n.strokeWeight=1;return n;}
function row(parent,name,w,gap=12){return stack(parent,name,w,'HORIZONTAL',gap);}
function stretch(n){n.layoutSizingHorizontal='FILL';return n;}
function spacer(parent){const n=box(parent,'Flexible space',1,1,null,0);n.layoutGrow=1;return n;}
function labelProp(comp,node,name='Label'){const k=comp.addComponentProperty(name,'TEXT',node.characters);node.componentPropertyReferences={characters:k};return k;}
function button(parent,label,type='Secondary',state='Default'){return inst(parent,'Button',{Type:type,State:state},label);}
function badge(parent,label,state='Pending'){return inst(parent,'Badge',{State:state},label);}
function card(parent,name,w,pad=24){return stroke(round(stack(parent,name,w,'VERTICAL',16,pad,'bg/surface'),16));}
function sectionTitle(parent,title,meta,w){const r=row(parent,title,w);txt(r,title,16,'Medium');spacer(r);if(meta)txt(r,meta,12,'Regular','text/secondary');return r;}
function progress(parent,width,pct,tone='brand/default'){
  const track=box(parent,'Progress track',width,6,'bg/muted',4);const bar=box(track,'Completed '+pct+'%',Math.max(2,width*pct/100),6,tone,4);return track;
}
function countCard(parent,title,count,hint,w,accent=false){
  const c=card(parent,title,w,20);const top=row(c,'Metric label',w-40);txt(top,title,14,'Regular','text/secondary');spacer(top);icon(top,accent?'bolt':'shippingbox',18,accent?'text/brand':'text/secondary');
  txt(c,count,32,'SemiBold');txt(c,hint,12,'Regular',accent?'text/brand':'text/secondary');return c;
}
function field(parent,label,value,w,error){
  const f=stack(parent,label,w,'VERTICAL',8);txt(f,label,12,'Medium','text/secondary');const input=inst(f,'Input',{State:error?'Error':'Default'},value);input.resize(w,44);const sh=Object.keys(input.componentProperties).find(k=>k.startsWith('Show icon#'));if(sh)input.setProperties({[sh]:false});if(error)txt(f,error,12,'Regular','danger/text',w);return f;
}
function checkbox(parent,label,on=true){const r=inst(parent,'Checkbox',{State:on?'On':'Off'},label);r.resize(440,28);return r;}
async function buildSidebar(){
  await figma.setCurrentPageAsync(PAGES.sidebar);
  const variants=[];
  for(const mode of ['Expanded','Collapsed'])for(const state of ['Default','Hover','Active','Focus','Disabled']){
    const c=track(figma.createComponent());PAGES.sidebar.appendChild(c);c.name='Mode='+mode+', State='+state;
    c.resize(mode==='Expanded'?236:44,40);c.layoutMode='HORIZONTAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';c.counterAxisAlignItems='CENTER';c.paddingLeft=c.paddingRight=12;c.itemSpacing=10;c.cornerRadius=10;
    bind(c,'cornerRadius','radius/10');bind(c,'paddingLeft','spacing/12');bind(c,'paddingRight','spacing/12');bind(c,'itemSpacing','spacing/10');
    c.fills=state==='Active'?[paint('brand/soft')]:state==='Hover'?[paint('bg/muted')]:[];if(state==='Focus')stroke(c,'border/focus');if(state==='Disabled')c.opacity=.4;
    const i=icon(c,'square.grid.2x2',20,state==='Active'?'text/brand':'text/secondary');if(i){i.name='Nav icon';}
    if(mode==='Expanded'){
      const t=txt(c,'대시보드',14,'Medium',state==='Active'?'text/brand':'text/secondary',136);t.layoutSizingHorizontal='FILL';t.name='Nav label';
      const b=round(stack(c,'Count',28,'HORIZONTAL',0,4,'bg/muted'),6);b.primaryAxisAlignItems='CENTER';const ct=txt(b,'24',11,'Medium','text/secondary');ct.name='Count label';b.visible=false;
    }variants.push(c);
  }
  const navSet=track(figma.combineAsVariants(variants,PAGES.sidebar));navSet.name='Automate/NavItem';COMP.NavItem=navSet;navSet.description='260px expanded sidebar / 60px rail. Active pill, hover, focus and disabled. SF Symbols icon swap and optional count.';navSet.x=180;navSet.y=100;
  const lp=navSet.addComponentProperty('Label','TEXT','대시보드'),cp=navSet.addComponentProperty('Count','TEXT','24'),bp=navSet.addComponentProperty('Show count','BOOLEAN',false),ip=navSet.addComponentProperty('Icon','INSTANCE_SWAP',ICON['square.grid.2x2'].id);for(const c of variants){const ni=c.findOne(n=>n.name==='Nav icon');if(ni)ni.componentPropertyReferences={mainComponent:ip};const nl=c.findOne(n=>n.name==='Nav label');if(nl)nl.componentPropertyReferences={characters:lp};const nc=c.findOne(n=>n.name==='Count label');if(nc)nc.componentPropertyReferences={characters:cp};const nb=c.findOne(n=>n.name==='Count');if(nb)nb.componentPropertyReferences={visible:bp};}
  variants.forEach((c,i)=>{c.x=24+(i%5)*270;c.y=24+Math.floor(i/5)*80;});navSet.resize(1374,184);
  const sides=[];
  for(const mode of ['Expanded','Collapsed','Floating','Resizable']){
    const w=mode==='Collapsed'?60:mode==='Resizable'?320:260;
    const c=track(figma.createComponent());PAGES.sidebar.appendChild(c);c.name='Mode='+mode;c.resize(w,960);c.layoutMode='VERTICAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';c.fills=[paint('bg/surface')];c.itemSpacing=0;stroke(c);
    if(mode==='Floating'){round(c,16);c.effects=[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:.08},offset:{x:0,y:8},radius:24,spread:-6,visible:true,blendMode:'NORMAL'}];}
    const h=row(c,'Workspace header',w,10);h.resize(w,64);h.primaryAxisSizingMode='FIXED';h.counterAxisSizingMode='FIXED';h.paddingLeft=h.paddingRight=mode==='Collapsed'?16:20;
    const mark=round(stack(h,'CALLTO mark',28,'HORIZONTAL',0,4,'brand/soft'),8);icon(mark,'shippingbox',20,'text/brand');
    if(mode!=='Collapsed'){txt(h,'CALLTO',18,'SemiBold');spacer(h);icon(h,'sidebar.left',18);}
    const nav=stack(c,'Primary navigation',w,'VERTICAL',4,mode==='Collapsed'?8:12);nav.layoutGrow=1;
    const menu=[['대시보드','square.grid.2x2'],['등록 요청','list.bullet.rectangle'],['자동 등록','bolt'],['상품 인덱싱','shippingbox'],['브랜드 관리','tag']];
    if(mode!=='Collapsed'){txt(nav,'WORKSPACE',11,'Medium','text/secondary');const gap=box(nav,'Section gap',1,4,null,0);}
    for(let k=0;k<menu.length;k++){
      const n=inst(nav,'NavItem',{Mode:mode==='Collapsed'?'Collapsed':'Expanded',State:k===0?'Active':'Default'},mode==='Collapsed'?undefined:menu[k][0]);n.name='Nav / '+menu[k][0];n.resize(w-(mode==='Collapsed'?16:24),40);
      const props=n.componentProperties;const swap=Object.keys(props).find(p=>props[p].type==='INSTANCE_SWAP');if(swap&&ICON[menu[k][1]])n.setProperties({[swap]:ICON[menu[k][1]].id});
      if(k===1&&mode!=='Collapsed'){const ct=Object.keys(props).find(p=>p.startsWith('Count#'));const sh=Object.keys(props).find(p=>p.startsWith('Show count#'));if(ct&&sh)n.setProperties({[ct]:'24',[sh]:true});}
    }
    const g=box(nav,'Section gap',1,24,null,0);
    if(mode!=='Collapsed')txt(nav,'CHANNELS',11,'Medium','text/secondary');
    for(const ch of ['고도몰 소매','고도몰 도매','네이버 스마트스토어']){
      const item=row(nav,'Channel / '+ch,w-(mode==='Collapsed'?16:24),12);item.paddingLeft=12;item.resize(w-(mode==='Collapsed'?16:24),36);item.primaryAxisSizingMode='FIXED';item.counterAxisSizingMode='FIXED';icon(item,'link',18);if(mode!=='Collapsed'){txt(item,ch,12,'Regular','text/secondary');}
    }
    const footer=stack(c,'Footer',w,'VERTICAL',12,mode==='Collapsed'?16:20);line(footer,w-(mode==='Collapsed'?32:40));const sr=row(footer,'Settings',w-(mode==='Collapsed'?32:40),12);icon(sr,'gearshape',20);if(mode!=='Collapsed')txt(sr,'환경 설정',14,'Regular','text/secondary');
    if(mode!=='Collapsed'){const user=row(footer,'Workspace user',w-40,10);const av=round(stack(user,'Avatar',32,'HORIZONTAL',0,7,'bg/muted'),16);txt(av,'임',12,'Medium');const ud=stack(user,'User label',w-82,'VERTICAL',2);txt(ud,'임예서',12,'Medium');txt(ud,'상품 운영팀',11,'Regular','text/secondary');}
    sides.push(c);
  }
  const s=track(figma.combineAsVariants(sides,PAGES.sidebar));s.name='Automate/Sidebar';s.description='Based on Sidemenu-prompt.md. 260/60px, resizable 180–400px, 240ms cubic-bezier(0.23,1,0.32,1); reduced motion = 0. Header 52px minimum. Rail logo expands; rail items require tooltips and keyboard labels. Nested section disclosure and navigation scrolling.';s.x=180;s.y=440;sides.forEach((c,i)=>{c.x=24+i*340;c.y=24;});s.resize(1384,1008);COMP.Sidebar=s;
  const sheet=stack(PAGES.sidebar,'Sidebar · Usage & interaction',1440,'VERTICAL',24,32,'bg/surface');sheet.x=180;sheet.y=1560;txt(sheet,'작업에 집중하는 사이드바',32,'SemiBold');txt(sheet,'Sidemenu-prompt.md의 구조와 인터랙션을 CALLTO의 톤으로 정리했습니다.',14,'Regular','text/secondary');
  const sr=row(sheet,'Sidebar variants',1376,24);for(const mode of ['Expanded','Collapsed','Floating','Resizable']){const v=inst(sr,'Sidebar',{Mode:mode});v.resize(v.width,740);}
  txt(sheet,'260px 기본 · 60px 접힘 · 180–400px 크기 조절 · 활성 메뉴 10px radius · 아이콘 20px',14,'Medium');
  txt(sheet,'접기 240ms / 레이블 120ms · Reduced motion 적용 · 키보드 포커스 2px · 접힘 메뉴에는 툴팁 · 하위 메뉴는 chevron과 들여쓰기로 구분',12,'Regular','text/secondary',1376);
  return s;
}
const SCREEN_LINKS=[];
function shell(name,title,subtitle,active,idx,collapsed=false){
  const f=stack(PAGES.screens,name,1440,'HORIZONTAL',0,0,'bg/canvas');f.resize(1440,1000);f.primaryAxisSizingMode='FIXED';f.counterAxisSizingMode='FIXED';f.counterAxisAlignItems='MIN';f.clipsContent=true;f.x=180+(idx%2)*1640;f.y=160+Math.floor(idx/2)*1240;
  const sb=inst(f,'Sidebar',{Mode:collapsed?'Collapsed':'Expanded'});sb.resize(collapsed?60:260,1000);
  for(const nav of sb.findAll(n=>n.type==='INSTANCE'&&n.name.startsWith('Nav / '))){const props=nav.componentProperties;if(props.State)nav.setProperties({State:nav.name==='Nav / '+active?'Active':'Default'});SCREEN_LINKS.push({node:nav,label:nav.name.slice(6)});}
  const ww=1440-sb.width;const main=stack(f,'Main content',ww,'VERTICAL',0);main.resize(ww,1000);main.primaryAxisSizingMode='FIXED';
  const top=row(main,'Top bar',ww,16);top.resize(ww,64);top.primaryAxisSizingMode='FIXED';top.counterAxisSizingMode='FIXED';top.paddingLeft=top.paddingRight=32;top.fills=[paint('bg/surface')];txt(top,'워크스페이스',12,'Regular','text/secondary');icon(top,'chevron.right',12);txt(top,active,12,'Medium');spacer(top);icon(top,'magnifyingglass',18);txt(top,'검색  ⌘K',12,'Regular','text/secondary');icon(top,'bell',18);txt(top,'임예서',12,'Medium');
  const body=stack(main,'Page content',ww,'VERTICAL',24,32);const cw=ww-64;
  const heading=row(body,'Page heading',cw,16);const names=stack(heading,'Title',cw-430,'VERTICAL',8);txt(names,title,24,'SemiBold');txt(names,subtitle,14,'Regular','text/secondary',cw-430);spacer(heading);
  SCREEN_LINKS.push({frame:f,name,body,heading,cw});return {frame:f,body,heading,cw};
}
function dataTable(parent,width,headers,widths,rows){
  const table=stack(parent,'Data table',width,'VERTICAL',0,0,'bg/surface');
  const head=row(table,'Table header',width,0);head.fills=[paint('bg/subtle')];head.resize(width,40);head.primaryAxisSizingMode='FIXED';head.counterAxisSizingMode='FIXED';
  headers.forEach((h,i)=>{const c=stack(head,'Column / '+h,widths[i],'HORIZONTAL',0,12);txt(c,h,11,'Medium','text/secondary');});
  rows.forEach((cells,ri)=>{const rr=row(table,'Row '+(ri+1),width,0);rr.resize(width,64);rr.primaryAxisSizingMode='FIXED';rr.counterAxisSizingMode='FIXED';
    cells.forEach((v,i)=>{const cc=stack(rr,headers[i],widths[i],'VERTICAL',4,12);if(headers[i]==='선택'){const check=inst(cc,'Checkbox',{State:v==='선택'?'On':'Off'});const label=check.findOne(n=>n.type==='TEXT');if(label)label.visible=false;check.resize(20,24);}else if(typeof v==='object'&&v.badge){badge(cc,v.badge,v.state);}else if(typeof v==='object'){txt(cc,v.title,13,'Medium','text/primary',widths[i]-24);if(v.sub)txt(cc,v.sub,11,'Regular','text/secondary',widths[i]-24);}else txt(cc,String(v),12,'Regular','text/secondary',widths[i]-24);});line(table,width);
  });return table;
}
async function buildScreens(){
  await figma.setCurrentPageAsync(PAGES.screens);
  // Dashboard
  const d=shell('01 · Dashboard','좋은 오후예요, 예서님','오늘의 등록 요청과 채널별 진행 상황을 확인하세요.','대시보드',0);
  button(d.heading,'새 등록 요청','Primary');const metrics=row(d.body,'Overview metrics',d.cw,16);
  [['등록 대기 상품','24','3개 요청 리스트'],['등록 중','8','고도몰 소매 · 도매'],['오늘 등록 완료','36','어제보다 12개 더 등록'],['확인 필요','3','누락 정보 2 · 실패 1']].forEach((m,i)=>countCard(metrics,...m,(d.cw-48)/4,i===1));
  const running=card(d.body,'Active registration',d.cw,20);const rt=row(running,'Running task',d.cw-40,12);icon(rt,'bolt',20,'text/brand');txt(rt,'영상 시스템 세트 상품 등록',16,'Medium');badge(rt,'등록 중','Running');spacer(rt);button(rt,'진행 상황 보기');
  const pr=row(running,'Progress summary',d.cw-40,16);txt(pr,'8 / 12개 처리',12,'Medium');progress(pr,d.cw-270,66.7);txt(pr,'67%',12,'Medium','text/brand');
  const columns=row(d.body,'Dashboard columns',d.cw,24);columns.counterAxisAlignItems='MIN';const left=card(columns,'Request queue',704,0);const lt=stack(left,'Queue header',704,'VERTICAL',12,20);sectionTitle(lt,'지금 처리할 등록 요청','전체 보기',664);
  dataTable(left,704,['요청 리스트','상품','상태','작성일'],[340,70,130,164],[
    [{title:'9월 신제품 등록',sub:'AVMATRIX · 영상 장비'},'12개',{badge:'등록 대기',state:'Pending'},'2026.09.30'],
    [{title:'오디오 액세서리 추가',sub:'ROXTONE · 케이블 / 커넥터'},'8개',{badge:'확인 필요',state:'Review'},'2026.09.30'],
    [{title:'TILTA 리깅 제품',sub:'TILTA · 카메라 액세서리'},'4개',{badge:'준비 완료',state:'Success'},'2026.09.29'],
    [{title:'영상 시스템 세트',sub:'AVMATRIX · 세트 상품'},'12개',{badge:'등록 중',state:'Running'},'2026.09.29']]);
  const right=stack(columns,'Channel summary',388,'VERTICAL',16);const ch=card(right,'Channels',388,20);sectionTitle(ch,'채널 연결','관리',348);
  for(const [name,detail,state]of [['고도몰 소매','마지막 확인 14:32','연결됨'],['고도몰 도매','마지막 확인 14:32','연결됨'],['네이버 스마트스토어','계정을 연결해 주세요','연결 필요']]){const rr=row(ch,name,348,12);icon(rr,'link',20);const cc=stack(rr,'Channel info',198,'VERTICAL',4);txt(cc,name,14,'Medium');txt(cc,detail,11,'Regular','text/secondary');badge(rr,state,state==='연결됨'?'Success':'Disconnected');}
  const tips=card(right,'Attention',388,20);txt(tips,'확인이 필요한 상품 3개',16,'Medium');txt(tips,'카테고리 미지정 2개와 등록 실패 1개가 있습니다. 정보를 보완한 뒤 다시 등록하세요.',13,'Regular','text/secondary',348);button(tips,'확인하러 가기');
  txt(d.body,'표시된 수치와 상품은 화면 설계를 위한 예시 데이터입니다.',11,'Regular','text/secondary');
  // Request overview
  const q=shell('02 · Registration requests','등록 요청','등록할 상품을 리스트로 모으고, 준비 상태를 확인하세요.','등록 요청',1);button(q.heading,'엑셀 불러오기');button(q.heading,'새 등록 요청','Primary');
  const tabs=row(q.body,'Request filters',q.cw,8);for(const [l,state]of [['전체  18','Active'],['대기  8','Default'],['진행 중  2','Default'],['완료  7','Default'],['확인 필요  1','Default']])inst(tabs,'Tab',{State:state},l);
  const search=row(q.body,'Search and sort',q.cw,12);const inp=inst(search,'Input',{State:'Default'},'리스트 이름, 브랜드 검색');inp.resize(440,40);button(search,'전체 채널');button(search,'최근 30일');spacer(search);txt(search,'최근 수정순',12,'Regular','text/secondary');
  const qt=card(q.body,'Request list',q.cw,0);dataTable(qt,q.cw,['등록 요청 리스트','상품 수','채널','준비 상태','진행률','최종 수정'],[330,90,230,146,150,170],[
    [{title:'9월 신제품 등록',sub:'임예서 · AVMATRIX'},'12개','소매 · 도매 · 스마트스토어',{badge:'준비 완료',state:'Success'},'0 / 12','09.30 14:32'],
    [{title:'영상 시스템 세트',sub:'임예서 · AVMATRIX'},'12개','소매 · 도매',{badge:'등록 중',state:'Running'},'8 / 12','09.30 14:28'],
    [{title:'오디오 액세서리 추가',sub:'임예서 · ROXTONE'},'8개','소매 · 스마트스토어',{badge:'확인 필요',state:'Review'},'0 / 8','09.30 13:51'],
    [{title:'TILTA 리깅 제품',sub:'임예서 · TILTA'},'4개','소매 · 도매',{badge:'등록 대기',state:'Pending'},'0 / 4','09.29 17:12'],
    [{title:'오디오 믹서 신제품',sub:'임예서 · MACKIE'},'6개','소매 · 도매',{badge:'등록 완료',state:'Success'},'6 / 6','09.29 15:06'],
    [{title:'마이크 액세서리 보충',sub:'임예서 · KANALS'},'10개','소매',{badge:'등록 완료',state:'Success'},'10 / 10','09.28 11:48']]);
  const pager=row(qt,'Pagination',q.cw,12);pager.paddingLeft=pager.paddingRight=20;pager.paddingTop=pager.paddingBottom=16;txt(pager,'총 18개 리스트 중 1–6',12,'Regular','text/secondary');spacer(pager);button(pager,'이전');button(pager,'1');button(pager,'2');button(pager,'3');button(pager,'다음');
  // Product detail
  const p=shell('03 · Product list detail','9월 신제품 등록','상품 정보를 저장한 다음, 준비된 상품을 채널에 등록하세요.','등록 요청',2);button(p.heading,'저장하기');button(p.heading,'선택 상품 등록','Primary');
  const note=round(stack(p.body,'Draft notice',p.cw,'HORIZONTAL',12,16,'info/bg'),12);icon(note,'info.circle',18,'info/text');txt(note,'저장하지 않은 변경 사항이 있습니다.',14,'Medium','info/text');spacer(note);txt(note,'마지막 저장 14:32',12,'Regular','info/text');
  const actions=row(p.body,'Product actions',p.cw,8);button(actions,'상품 추가');button(actions,'일괄 설정');button(actions,'복제');button(actions,'삭제','Ghost');spacer(actions);button(actions,'열 표시');txt(actions,'12개 상품',12,'Medium','text/secondary');
  const pt=card(p.body,'Products',p.cw,0);dataTable(pt,p.cw,['선택','브랜드 / 상품','소매','도매','스마트스토어','준비 상태'],[64,420,144,144,176,168],[
    ['선택',{title:'AVMATRIX PTZ1271-12A (White)',sub:'PTZ 카메라 · 상품명 HTML 원본 유지'},'₩1,290,000','₩880,000','₩1,290,000',{badge:'준비 완료',state:'Success'}],
    ['선택',{title:'AVMATRIX PKC4000',sub:'PTZ 카메라 컨트롤러'},'₩890,000','₩610,000','₩890,000',{badge:'준비 완료',state:'Success'}],
    ['—',{title:'ROXTONE PSS130',sub:'카테고리를 선택해 주세요'},'₩28,000','₩19,000','₩28,000',{badge:'정보 누락',state:'Review'}],
    ['—',{title:'TILTA TA-T01',sub:'스마트스토어 상품명 50자 초과'},'₩124,000','₩82,000','₩124,000',{badge:'확인 필요',state:'Review'}],
    ['—',{title:'MACKIE ProFX6v3',sub:'고도몰 소매 · 상품번호 1000008211'},'₩289,000','₩198,000','대상 아님',{badge:'등록 완료',state:'Success'}]]);
  const foot=row(p.body,'Selection summary',p.cw,12);txt(foot,'2개 선택됨',14,'Medium');txt(foot,'준비 완료 상품 2개 · 등록 대상 채널 3개',12,'Regular','text/secondary');spacer(foot);button(foot,'등록 전 검토');
  txt(p.body,'선택 · 브랜드 / 상품 열은 고정하고 가격과 채널 열은 가로로 스크롤합니다. 완료 여부와 행 선택은 별도 상태입니다.',12,'Regular','text/secondary',p.cw);
  // Automation
  const a=shell('04 · Automation running','자동 등록','실행 중인 작업과 채널별 등록 결과를 확인하세요.','자동 등록',3);button(a.heading,'작업 이력');button(a.heading,'현재 상품 완료 후 중단');
  const ac=card(a.body,'Run overview',a.cw,24);const ah=row(ac,'Run identity',a.cw-48);icon(ah,'bolt',24,'text/brand');const at=stack(ah,'Run title',620,'VERTICAL',4);txt(at,'영상 시스템 세트 상품 등록',20,'SemiBold');txt(at,'고도몰 소매 · 도매  /  시작 14:28  /  경과 4분 12초',12,'Regular','text/secondary');spacer(ah);badge(ah,'등록 중','Running');
  progress(ac,a.cw-48,67);const nums=row(ac,'Result counts',a.cw-48,32);txt(nums,'8 / 12개 처리',16,'Medium');txt(nums,'성공 7',14,'Medium','success/text');txt(nums,'실패 1',14,'Medium','danger/text');txt(nums,'대기 4',14,'Regular','text/secondary');
  const ast=row(a.body,'Current step',a.cw,12);const step=round(stack(ast,'Current job',a.cw,'HORIZONTAL',12,16,'brand/soft'),12);icon(step,'arrow.clockwise',20,'text/brand');txt(step,'PTZ1271-12A · 고도몰 도매에 상세페이지 입력 중',14,'Medium','text/brand');
  const logs=card(a.body,'Registration log',a.cw,0);dataTable(logs,a.cw,['상품','고도몰 소매','고도몰 도매','결과 / 다음 작업'],[360,180,180,396],[
    [{title:'PTZ1271-12A (White)',sub:'현재 처리 중'},{badge:'완료',state:'Success'},{badge:'등록 중',state:'Running'},'상품번호 1000008214'],
    [{title:'PKC4000',sub:'14:31:18'},{badge:'완료',state:'Success'},{badge:'완료',state:'Success'},'모든 대상 채널 등록 완료'],
    [{title:'ROXTONE PSS130',sub:'14:30:42'},{badge:'완료',state:'Success'},{badge:'실패',state:'Failed'},'브랜드 코드 불일치 · 확인 후 재시도'],
    [{title:'TILTA TA-T01',sub:'대기 중'},{badge:'대기',state:'Pending'},{badge:'대기',state:'Pending'},'앞선 상품 처리 후 시작']]);
  const fail=round(stack(a.body,'Failure recovery',a.cw,'HORIZONTAL',12,16,'warning/bg'),12);icon(fail,'exclamationmark.triangle.fill',20,'warning/text');const fc=stack(fail,'Failure description',780,'VERTICAL',4);txt(fc,'1개 상품은 확인이 필요합니다.',14,'Medium','warning/text');txt(fc,'성공한 채널은 유지하고 실패한 채널만 다시 등록합니다.',12,'Regular','warning/text');spacer(fail);button(fail,'실패 상세 보기');
  // Indexing
  const ix=shell('05 · Product index','상품 인덱싱','자주 사용하는 상품 정보와 상세페이지를 모아 두세요.','상품 인덱싱',4);button(ix.heading,'상품 인덱싱 추가','Primary');
  const ir=row(ix.body,'Index toolbar',ix.cw,12);const ii=inst(ir,'Input',{State:'Default'},'브랜드, 모델명, 상품명 검색');ii.resize(480,40);button(ir,'전체 브랜드');button(ir,'최근 수정순');
  for(let rr=0;rr<2;rr++){const cards=row(ix.body,'Index cards',ix.cw,20);for(let cc=0;cc<3;cc++){const names=['PTZ1271-12A (White)','PKC4000','PSS130','TA-T01','ProFX6v3','HD BASIC'];const idx=rr*3+cc;const w=(ix.cw-40)/3;const c=card(cards,names[idx],w,20);const br=row(c,'Product brand',w-40);icon(br,'shippingbox',20,'text/brand');txt(br,idx<2?'AVMATRIX':idx===2?'ROXTONE':idx===3?'TILTA':idx===4?'MACKIE':'AVMATRIX',11,'Medium','text/secondary');spacer(br);icon(br,'ellipsis',18);txt(c,names[idx],16,'Medium');txt(c,'상세페이지 HTML · 이미지 3장',12,'Regular','text/secondary');line(c,w-40);const cr=row(c,'Product actions',w-40,8);button(cr,'HTML 복사');button(cr,'목록에 추가','Primary');}}
  // Settings
  const se=shell('06 · Connections and settings','채널 연결 및 설정','상품 등록에 사용할 채널과 실행 환경을 관리하세요.','환경 설정',5);button(se.heading,'변경 사항 저장','Primary');
  for(const [name,status,desc]of [['고도몰 소매','연결됨','상품 등록 및 등록 결과 동기화'],['고도몰 도매','로그인 필요','세션이 만료되었습니다. 다시 로그인해 주세요.'],['네이버 스마트스토어','연결 필요','스토어 계정을 연결하고 등록 권한을 확인해 주세요.']]){const cr=card(se.body,name,se.cw,24);const ch=row(cr,'Channel heading',se.cw-48,16);icon(ch,'link',24);const ct=stack(ch,'Channel text',690,'VERTICAL',6);txt(ct,name,16,'Medium');txt(ct,desc,13,'Regular','text/secondary');spacer(ch);badge(ch,status,status==='연결됨'?'Success':'Disconnected');button(ch,status==='연결됨'?'연결 관리':'연결하기');}
  const prefs=card(se.body,'Execution defaults',se.cw,24);txt(prefs,'등록 기본 설정',16,'Medium');checkbox(prefs,'등록 후 판매·노출 상태 검토',true);checkbox(prefs,'실패 시 현재 작업 일시 중지',false);checkbox(prefs,'등록 전 검토 화면 표시',true);
  return SCREEN_LINKS.filter(x=>x.frame).map(x=>({id:x.frame.id,name:x.name}));
}
async function buildDialogs(){
  await figma.setCurrentPageAsync(PAGES.screens);
  const baseX=3460;
  function modal(name,w,idx){const m=card(PAGES.screens,name,w,28);m.x=baseX+(idx%2)*800;m.y=160+Math.floor(idx/2)*1120;const head=row(m,'Dialog header',w-56);txt(head,name,20,'SemiBold');spacer(head);icon(head,'xmark',20);return m;}
  const edit=modal('07 · 상품 정보 편집',720,0);const tabs=row(edit,'Edit tabs',664,8);inst(tabs,'Tab',{State:'Active'},'기본 정보');inst(tabs,'Tab',{State:'Default'},'이미지 · 상세페이지');inst(tabs,'Tab',{State:'Default'},'등록 채널');
  field(edit,'상품명','AVMATRIX PTZ1271-12A (White)',664);txt(edit,'상품명 HTML 원본은 저장·복사·자동화 전달 시 유지됩니다.',12,'Regular','text/secondary');const rr=row(edit,'Brand and model',664,16);field(rr,'브랜드','AVMATRIX',324);field(rr,'모델명','PTZ1271-12A',324);const prices=row(edit,'Retail prices',664,16);field(prices,'소매 판매가','1,290,000',324);field(prices,'소매 정가','1,490,000',324);const ws=row(edit,'Wholesale prices',664,16);field(ws,'도매 베이직','880,000',324);field(ws,'도매 마스터','820,000',324);
  field(edit,'스마트스토어 상품명','AVMATRIX PTZ1271 12배줌 PTZ 카메라 화이트',664);txt(edit,'34 / 50자 · 스마트스토어 판매가는 소매 판매가와 연동됩니다.',12,'Regular','text/secondary');line(edit,664);checkbox(edit,'고도몰 소매 등록',true);checkbox(edit,'고도몰 도매 등록',true);checkbox(edit,'네이버 스마트스토어 등록',false);const ef=row(edit,'Editor actions',664);txt(ef,'목록에 반영 후 상단에서 저장해 주세요.',12,'Regular','text/secondary');spacer(ef);button(ef,'취소');button(ef,'목록에 반영','Primary');
  const confirm=modal('08 · 등록 전 검토',640,1);txt(confirm,'2개 상품을 3개 채널에 등록합니다.',16,'Medium');txt(confirm,'저장된 상품 정보를 확인한 뒤 등록을 시작하세요.',14,'Regular','text/secondary');
  for(const [l,v]of [['등록할 상품','2개'],['대상 채널','고도몰 소매 · 도매 · 스마트스토어'],['이미지 검사','2 / 2개 확인 완료'],['등록 후 노출','노출 안 함 · 판매 기본값']]){const r=row(confirm,l,584);txt(r,l,14,'Regular','text/secondary');spacer(r);txt(r,v,14,'Medium');}
  const notice=round(stack(confirm,'Connection warning',584,'VERTICAL',8,16,'warning/bg'),12);txt(notice,'스마트스토어 연결이 필요합니다.',14,'Medium','warning/text');txt(notice,'채널을 연결하거나 이번 등록 대상에서 제외하세요.',13,'Regular','warning/text',552);const cf=row(confirm,'Confirm actions',584);button(cf,'취소');spacer(cf);button(cf,'채널 연결');button(cf,'등록 시작','Primary','Disabled');
  const result=modal('09 · 일부 등록 완료',640,2);icon(result,'exclamationmark.triangle.fill',32,'warning/text');txt(result,'12개 중 11개 등록 완료',24,'SemiBold');txt(result,'1개 상품의 고도몰 도매 등록에 실패했습니다.',14,'Regular','text/secondary');const rc=card(result,'Failed item',584,20);txt(rc,'ROXTONE PSS130',16,'Medium');badge(rc,'고도몰 도매 · 실패','Failed');txt(rc,'브랜드 코드가 쇼핑몰의 브랜드와 일치하지 않습니다.',13,'Regular','text/secondary',544);const rf=row(result,'Result actions',584);button(rf,'결과 다운로드');spacer(rf);button(rf,'실패 항목 수정','Primary');
  const imageDialog=modal('10 · 이미지 및 상세페이지',720,3);const upload=round(stack(imageDialog,'Thumbnail upload',664,'HORIZONTAL',20,20,'bg/subtle'),12);const thumb=round(stack(upload,'Image placeholder',120,'VERTICAL',10,24,'bg/surface'),12);icon(thumb,'photo',36);txt(thumb,'썸네일',12,'Regular','text/secondary');const desc=stack(upload,'Upload guidance',464,'VERTICAL',12);txt(desc,'상품 썸네일',16,'Medium');txt(desc,'JPG · PNG · WEBP · GIF / 최대 6MB',12,'Regular','text/secondary');button(desc,'이미지 선택');field(imageDialog,'이미지 폴더','product / system',664);const im=row(imageDialog,'Image filename',664,16);field(im,'모델명','ptz1271-12a',436);field(im,'이미지 수','3',212);button(imageDialog,'이미지 주소 생성');field(imageDialog,'상세페이지 이미지 주소','https://calla.hgodo.com/product/system/...',664);badge(imageDialog,'이미지 확인 완료','Success');checkbox(imageDialog,'이미지 클릭 시 링크 연결',false);const html=card(imageDialog,'HTML preview',664,16);txt(html,'상세페이지 HTML',14,'Medium');txt(html,'<div align="center">\n  <img src="https://calla.hgodo.com/…">\n</div>',12,'Regular','text/secondary',632);const ift=row(imageDialog,'Image actions',664);button(ift,'HTML 복사');spacer(ift);button(ift,'취소');button(ift,'목록에 반영','Primary');
  return [edit,confirm,result,imageDialog].map(n=>({id:n.id,name:n.name}));
}
async function wirePrototype(){
  const frames=SCREEN_LINKS.filter(x=>x.frame);const dest={'대시보드':frames[0].frame.id,'등록 요청':frames[1].frame.id,'자동 등록':frames[3].frame.id,'상품 인덱싱':frames[4].frame.id,'환경 설정':frames[5].frame.id};
  for(const entry of SCREEN_LINKS.filter(x=>x.node&&dest[x.label]))await entry.node.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:dest[entry.label],navigation:'NAVIGATE',transition:null,resetScrollPosition:true}]}]);
  const dashBtn=frames[0].heading.findOne(n=>n.type==='INSTANCE'&&n.name.includes('Button'));if(dashBtn)await dashBtn.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:frames[1].frame.id,navigation:'NAVIGATE',transition:null,resetScrollPosition:true}]}]);
  return Object.keys(dest);
}
