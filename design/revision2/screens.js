const LINKS=[];
function stat(parent,title,value,sub,w){const c=card(parent,title,w,24);txt(c,title,14,'Medium','text/secondary');const r=row(c,'Value',w-48);txt(r,value,28,'SemiBold');spacer(r);icon(r,'shippingbox',20,'brand/default');txt(c,sub,12,'Regular','text/secondary',w-48);return c;}
function search(parent,value,w=420){const i=inst(parent,'Input',{State:'Default'},value);i.resize(w,44);return i;}
function channel(parent,label,naver=false){const n=round(stroke(row(parent,'Channel '+label,30,0),naver?'success/text':'brand/default'),6);n.resize(30,30);n.counterAxisSizingMode='FIXED';n.primaryAxisAlignItems='CENTER';txt(n,label,14,'Medium',naver?'success/text':'brand/default');return n;}
function tableCheck(parent,on=false){const i=inst(parent,'Checkbox',{State:on?'On':'Off'});i.resize(20,24);const t=i.findOne(n=>n.type==='TEXT');if(t)t.visible=false;return i;}
function simpleTable(parent,w,heads,widths,data){
  const wrap=card(parent,'Table / '+heads.join(' · '),w,24),iw=w-48;
  const head=round(row(wrap,'Table header',iw,0),16);head.fills=[paint('bg/subtle')];head.resize(iw,56);head.counterAxisSizingMode='FIXED';
  heads.forEach((v,i)=>{const cell=stack(head,'Column '+v,widths[i],'HORIZONTAL',0,12);txt(cell,v,16,'Regular','text/secondary');});
  for(let ri=0;ri<data.length;ri++){
    const r=row(wrap,'Row '+(ri+1),iw,0);r.resize(iw,72);r.counterAxisSizingMode='FIXED';
    data[ri].forEach((v,i)=>{const cell=stack(r,heads[i],widths[i],'VERTICAL',4,12);if(heads[i]==='선택')tableCheck(cell,v===true);else if(typeof v==='object'&&v.state)badge(cell,v.label,v.state);else if(typeof v==='object'&&v.button)button(cell,v.button,v.type||'Secondary',v.disabled?'Disabled':'Default');else if(typeof v==='object'){txt(cell,v.title,18,'Medium','text/primary',widths[i]-24);if(v.sub)txt(cell,v.sub,12,'Regular','text/secondary',widths[i]-24);}else txt(cell,String(v),18,'Regular','text/primary',widths[i]-24);});line(wrap,iw);
  }
  wrap.itemSpacing=0;return wrap;
}
function pager(parent,w,total,shown){const p=row(parent,'Pagination',w);txt(p,`전체 ${total}개 중 1–${shown}개 표시`,14,'Regular','text/secondary');spacer(p);button(p,'이전','Ghost','Disabled');button(p,'1','Primary');button(p,'2','Ghost');button(p,'다음','Ghost');return p;}
function shell(name,title,subtitle,active,index,actions=[]){
  const existing=PAGES.screens.children.find(n=>n.name===name);if(existing)return null;
  const f=stack(PAGES.screens,name,1920,'VERTICAL',0,0,'bg/canvas');f.resize(1920,1080);f.primaryAxisSizingMode='FIXED';f.clipsContent=true;f.x=180+(index%2)*2120;f.y=160+Math.floor(index/2)*1280;
  const gnb=row(f,'GNB / 72',1920,24);gnb.resize(1920,72);gnb.counterAxisSizingMode='FIXED';gnb.fills=[paint('bg/surface')];
  const brand=row(gnb,'Brand',260,14);brand.paddingLeft=28;logo(brand);txt(brand,'상품 등록 툴',14,'Medium');search(gnb,'상품 또는 리스트 검색',420);spacer(gnb);txt(gnb,'임예서',16,'Medium');txt(gnb,'관리자',12,'Regular','text/secondary');icon(gnb,'bell',20);icon(gnb,'gearshape',20);box(gnb,'Right inset',8,1,null,0);
  const bodyRow=row(f,'Application body',1920,0);bodyRow.counterAxisAlignItems='MIN';bodyRow.resize(1920,1008);bodyRow.counterAxisSizingMode='FIXED';
  const sb=inst(bodyRow,'Sidebar',{Mode:'Expanded'});sb.resize(260,1008);for(const n of sb.findAll(n=>n.type==='INSTANCE'&&n.name.startsWith('Nav / '))){if(n.componentProperties.State)n.setProperties({State:n.name.slice(6)===active?'Active':'Default'});applySidebarIconForeground(n);}
  const main=stack(bodyRow,'Main content',1660,'VERTICAL',0);main.resize(1660,1008);main.primaryAxisSizingMode='FIXED';
  const bc=row(main,'NAVIGATION / 72',1660,16);bc.resize(1660,72);bc.counterAxisSizingMode='FIXED';bc.paddingLeft=bc.paddingRight=36;txt(bc,['상품 인덱싱','상품 카테고리','서버 이미지 폴더','동기화 설정'].includes(active)?'설정':'상품 등록',18,'Regular','text/secondary');icon(bc,'chevron.right',16);txt(bc,active,18,'Medium');spacer(bc);for(const a of actions)button(bc,a[0],a[1]||'Secondary');
  const body=stack(main,'Page content',1660,'VERTICAL',24,36);body.paddingTop=28;body.paddingBottom=24;const cw=1588;const heading=stack(body,'Page title',cw,'VERTICAL',10);txt(heading,title,36,'SemiBold');txt(heading,subtitle,18,'Regular','text/secondary',cw);
  SCREENS.push({frame:f,name,active,body,main,cw,heading});return{frame:f,body,cw,heading,nav:bc};
}
async function buildExtraComponents(){
  await figma.setCurrentPageAsync(PAGES.components);
  if(!COMP.ChannelChip){const vv=[];for(const ch of ['Retail','Wholesale','Naver']){const c=track(figma.createComponent());PAGES.components.appendChild(c);c.name='Channel='+ch;c.resize(34,34);c.layoutMode='HORIZONTAL';c.counterAxisAlignItems='CENTER';c.primaryAxisAlignItems='CENTER';c.fills=[];c.cornerRadius=6;stroke(c,ch==='Naver'?'success/text':'brand/default');txt(c,ch==='Retail'?'소':ch==='Wholesale'?'도':'네',14,'Medium',ch==='Naver'?'success/text':'brand/default');vv.push(c);}const s=track(figma.combineAsVariants(vv,PAGES.components));s.name='Calla/ChannelChip';s.description='소매 / 도매 / 네이버 채널 식별. 색상과 글자를 함께 사용.';s.x=180;s.y=3600;s.resize(220,82);vv.forEach((c,i)=>{c.x=20+i*64;c.y=24;});COMP.ChannelChip=s;}
  if(!COMP.Skeleton){const c=track(figma.createComponent());PAGES.components.appendChild(c);c.name='Calla/SkeletonRow';c.resize(700,72);c.layoutMode='HORIZONTAL';c.counterAxisAlignItems='CENTER';c.paddingLeft=c.paddingRight=20;c.itemSpacing=20;c.fills=[paint('bg/surface')];for(const w of [24,260,100,100,76])box(c,'Loading placeholder',w,18,'bg/hover',8);c.x=180;c.y=3750;c.description='조회 중 72px 표 행. 완료 전 임시 값 대신 사용.';COMP.Skeleton=c;}
}
async function buildScreens(){
  await figma.setCurrentPageAsync(PAGES.screens);
  const r=shell('01 · 등록 요청 상품','등록 요청 상품','상품 정보를 준비하고, 채널별 등록 진행을 한눈에 확인하세요.','등록 요청 상품',0,[['엑셀 불러오기'],['리스트 등록','Primary']]);
  if(r){const summary=row(r.body,'Summary',r.cw,16);for(const [t,v,s]of [['등록 대기 상품','24','등록 요청 3개 리스트'],['진행 중','8','현재 상품 등록 중'],['오늘 완료','36','채널별 등록 결과 기준'],['확인 필요','3','입력 누락 2 · 등록 실패 1']])stat(summary,t,v,s,385);
    const tools=row(r.body,'List toolbar',r.cw,12);search(tools,'리스트 이름 또는 등록자 검색',420);button(tools,'전체 상태');button(tools,'전체 채널');spacer(tools);button(tools,'일괄 설정');button(tools,'복제','Ghost');button(tools,'삭제','Ghost');
    const heads=['선택','등록일자','리스트 이름','등록자','고도몰 소매','고도몰 도매','스마트스토어','작업 진행'];const widths=[48,160,468,140,168,168,168,220];
    simpleTable(r.body,r.cw,heads,widths,[
      [false,'2026.09.30',{title:'260930-중고 상품 리스트',sub:'영상 장비 · 12개 상품'},'임예서','12 / 12','12 / 12','대상 없음',{label:'작업 완료',state:'Success'}],
      [false,'2026.09.30',{title:'9월 신제품 등록',sub:'AVMATRIX · 12개 상품'},'임예서','8 / 12','4 / 12','연결 필요',{label:'진행 중',state:'Running'}],
      [false,'2026.09.29',{title:'오디오 액세서리 추가',sub:'ROXTONE · 8개 상품'},'임예서','0 / 8','0 / 8','대상 없음',{label:'확인 필요',state:'Warning'}],
      [false,'2026.09.29',{title:'TILTA 리깅 제품',sub:'카메라 액세서리 · 4개 상품'},'임예서','0 / 4','0 / 4','0 / 4',{label:'대기',state:'Pending'}]
    ]);pager(r.body,r.cw,24,4);}
  const d=shell('02 · 요청 리스트 상세','9월 신제품 등록','상품 편집 내용을 목록에 반영한 다음, 저장하여 자동 등록에 전달하세요.','등록 요청 상품',1,[['엑셀 내보내기'],['저장하기','Primary']]);
  if(d){const top=row(d.body,'Product actions',d.cw,12);button(top,'상품 추가','Primary');button(top,'일괄 설정');button(top,'복제');button(top,'삭제','Ghost');spacer(top);txt(top,'5개의 상품',16,'Medium');button(top,'표시할 열');
    const notice=round(stack(d.body,'Draft notice',d.cw,'HORIZONTAL',12,16,'brand/soft'),12);icon(notice,'info.circle',20,'brand/default');txt(notice,'저장하지 않은 변경 사항이 있습니다.',16,'Medium','text/primary');spacer(notice);txt(notice,'마지막 저장 14:32',14,'Regular','text/secondary');
    simpleTable(d.body,d.cw,['선택','브랜드 / 상품명','소매 판매가','소매 정가','도매 베이직','도매 마스터','준비 상태'],[48,512,196,196,196,196,196],[
      [true,{title:'AVMATRIX PTZ1271-12A (White)',sub:'상품명 HTML 유지 · PTZ 카메라'},'1,290,000','1,490,000','880,000','820,000',{label:'준비 완료',state:'Success'}],
      [true,{title:'AVMATRIX PKC4000',sub:'PTZ 카메라 컨트롤러'},'890,000','990,000','610,000','580,000',{label:'준비 완료',state:'Success'}],
      [false,{title:'ROXTONE PSS130',sub:'카테고리를 지정해 주세요'},'28,000','32,000','19,000','18,000',{label:'정보 누락',state:'Warning'}],
      [false,{title:'TILTA TA-T01',sub:'스마트스토어 상품명 확인 필요'},'124,000','148,000','82,000','78,000',{label:'검토 필요',state:'Review'}],
      [false,{title:'MACKIE ProFX6v3',sub:'고도몰 소매 · 상품번호 1000008211'},'289,000','329,000','198,000','189,000',{label:'등록 완료',state:'Success'}]
    ]);const selection=row(d.body,'Selected products',d.cw);txt(selection,'2개 선택됨',16,'Medium');txt(selection,'준비 완료 상품 2개 · 등록 결과와 행 선택은 별도 상태입니다.',14,'Regular','text/secondary');spacer(selection);button(selection,'등록 전 검토','Primary');}
  const a=shell('03 · 자동 상품 등록','자동 상품 등록','등록할 리스트를 선택하고 대상 채널을 확인한 뒤 시작하세요.','자동 상품 등록',2,[['실행 기록'],['채널 연결']]);
  if(a){const statuses=row(a.body,'Channel readiness',a.cw,16);badge(statuses,'고도몰 소매 연결됨','Success');badge(statuses,'고도몰 도매 연결됨','Success');badge(statuses,'스마트스토어 연결 필요','Warning');spacer(statuses);txt(statuses,'로컬 실행기 · 연결됨',14,'Medium','success/text');
    txt(a.body,'등록 가능한 리스트 · 3개',18,'Medium');const hs=['선택','등록일자','리스트 이름','등록자','소매 / 도매 / 네이버','작업 진행','등록 진행'];const ws=[48,160,492,140,300,200,200];
    simpleTable(a.body,a.cw,hs,ws,[[false,'2026.09.30','9월 신제품 등록','임예서','12개 / 12개 / 12개',{label:'대기',state:'Pending'},{button:'등록하기',type:'Primary'}],[false,'2026.09.29','오디오 액세서리 추가','임예서','8개 / 8개 / 제외',{label:'검토 필요',state:'Warning'},{button:'정보 확인'}],[false,'2026.09.29','TILTA 리깅 제품','임예서','4개 / 4개 / 4개',{label:'대기',state:'Pending'},{button:'등록하기',type:'Primary'}]]);
    txt(a.body,'등록 완료된 리스트 · 1개',18,'Medium');simpleTable(a.body,a.cw,hs,ws,[[false,'2026.09.30','260930-중고 상품 리스트','임예서','12 / 12 · 12 / 12 · 제외',{label:'작업 완료',state:'Success'},{button:'결과 보기'}]]);}
  const run=shell('04 · 등록 진행 및 결과','등록 진행 및 결과','현재 상품과 채널별 결과를 확인하고, 실패한 항목만 다시 처리하세요.','자동 상품 등록',3,[['일시 중지'],['실행 기록']]);
  if(run){const main=card(run.body,'Registration progress',run.cw,32);const title=row(main,'Batch title',run.cw-64);icon(title,'bolt',24,'brand/default');txt(title,'9월 신제품 등록',22,'SemiBold');spacer(title);badge(title,'진행 중','Running');const values=row(main,'Progress values',run.cw-64);txt(values,'8 / 12개 처리',28,'SemiBold');spacer(values);txt(values,'67%',22,'SemiBold','brand/default');bar(main,run.cw-64,67);txt(main,'AVMATRIX PKC4000 · 고도몰 도매에 상품 정보를 저장하고 있습니다.',16,'Regular','text/secondary');
    const cols=row(run.body,'Results layout',run.cw,24);const steps=card(cols,'Registration steps',600,28);txt(steps,'등록 단계',22,'SemiBold');for(const [t,s]of [['상품 정보 검사','완료'],['이미지 확인','완료'],['고도몰 소매 등록','완료'],['고도몰 도매 등록','진행 중'],['결과 동기화','대기']]){const z=row(steps,'Step '+t,544);icon(z,s==='완료'?'checkmark.circle.fill':s==='진행 중'?'arrow.clockwise':'clock',22,s==='완료'?'success/text':'brand/default');txt(z,t,18,'Medium');spacer(z);txt(z,s,14,'Regular','text/secondary');}
    const log=card(cols,'Activity log',964,28);txt(log,'실시간 작업 기록',22,'SemiBold');for(const [time,msg]of [['14:36:20','AVMATRIX PKC4000 · 도매 정보 저장 중'],['14:36:14','AVMATRIX PKC4000 · 소매 등록 완료'],['14:35:58','ROXTONE PSS130 · 브랜드 매핑 확인 필요'],['14:35:30','AVMATRIX PTZ1271 · 이미지 확인 완료']]){const z=row(log,'Log',908,20);txt(z,time,14,'Regular','text/secondary');txt(z,msg,16,'Regular','text/primary',788);}
    const warn=round(stack(run.body,'Partial failure',run.cw,'HORIZONTAL',16,20,'warning/bg'),16);icon(warn,'exclamationmark.triangle.fill',24,'warning/text');txt(warn,'1개 상품에 확인이 필요합니다. 완료된 채널은 유지하고 실패한 채널만 재시도합니다.',16,'Medium','warning/text');spacer(warn);button(warn,'실패 항목 확인');}
  const ix=shell('05 · 상품 인덱싱','상품 인덱싱','기존 상품을 검색하여 브랜드, 가격, 이미지와 상세페이지 정보를 재사용하세요.','상품 인덱싱',4,[['인덱스 갱신','Primary']]);
  if(ix){const sr=row(ix.body,'Index search',ix.cw,12);search(sr,'상품명 · 모델명 · 상품번호 검색',560);button(sr,'전체 브랜드');button(sr,'전체 카테고리');spacer(sr);txt(sr,'마지막 갱신 2026.09.30 14:30',14,'Regular','text/secondary');
    simpleTable(ix.body,ix.cw,['선택','상품','상품번호','브랜드','소매 판매가','상세페이지',''],[48,560,200,180,200,220,132],[[false,{title:'AVMATRIX PTZ1271-12A',sub:'PTZ 카메라 · 12배 광학 줌'},'1000008136','AVMATRIX','1,290,000',{label:'사용 가능',state:'Success'},{button:'불러오기'}],[false,{title:'AVMATRIX PKC4000',sub:'PTZ 카메라 컨트롤러'},'1000008137','AVMATRIX','890,000',{label:'사용 가능',state:'Success'},{button:'불러오기'}],[false,{title:'ROXTONE PSS130',sub:'오디오 케이블'},'1000008138','ROXTONE','28,000',{label:'확인 필요',state:'Warning'},{button:'미리보기'}],[false,{title:'TILTA TA-T01',sub:'카메라 리깅'},'1000008139','TILTA','124,000',{label:'사용 가능',state:'Success'},{button:'불러오기'}]]);pager(ix.body,ix.cw,8422,4);}
  const cat=shell('06 · 상품 카테고리','상품 카테고리','고도몰 소매·도매와 스마트스토어의 카테고리를 각각 연결하세요.','상품 카테고리',5,[['코드 새로고침'],['변경 사항 저장','Primary']]);
  if(cat){const layout=row(cat.body,'Category layout',cat.cw,24);layout.counterAxisAlignItems='MIN';const tree=card(layout,'Category tree',400,24);search(tree,'카테고리 검색',352);for(const label of ['영상 장비','  PTZ 카메라','  영상 스위처','오디오 장비','  믹서 / 인터페이스','케이블 / 커넥터','카메라 액세서리']){const rr=row(tree,label,352);icon(rr,'chevron.right',14);txt(rr,label,16,label.includes('PTZ')?'Medium':'Regular',label.includes('PTZ')?'brand/default':'text/primary');}
    const mapping=card(layout,'Category mapping',1164,28);txt(mapping,'PTZ 카메라',22,'SemiBold');txt(mapping,'채널별 카테고리는 독립적으로 저장됩니다.',16,'Regular','text/secondary');field(mapping,'고도몰 소매','영상 장비 > 카메라 > PTZ 카메라',1108);field(mapping,'고도몰 도매','영상 장비 > PTZ 카메라',1108);field(mapping,'네이버 스마트스토어','스토어 연결 후 카테고리를 선택하세요.',1108,'Disabled');badge(mapping,'스마트스토어 연결 필요','Warning');const zz=row(mapping,'Mapping actions',1108);spacer(zz);button(zz,'초기화');button(zz,'매핑 저장','Primary');}
  const folder=shell('07 · 서버 이미지 폴더','서버 이미지 폴더','상세페이지 이미지의 기본 경로와 파일명 규칙을 관리하세요.','서버 이미지 폴더',6,[['폴더 추가','Primary']]);
  if(folder){const overview=row(folder.body,'Folder summary',folder.cw,16);stat(overview,'등록된 폴더','4','상세페이지용 기본 경로',518);stat(overview,'기본 경로','calla.hgodo.com','공개 이미지 주소',518);stat(overview,'주소 검사','정상','마지막 확인 14:30',520);
    simpleTable(folder.body,folder.cw,['폴더 이름','기본 URL','파일명 규칙','상태',''],[240,656,320,180,144],[['product / system','https://calla.hgodo.com/product/system/','{model}-{번호}.jpg',{label:'사용 중',state:'Success'},{button:'수정'}],['product / audio','https://calla.hgodo.com/product/audio/','{model}-{번호}.jpg',{label:'사용 중',state:'Success'},{button:'수정'}],['product / cable','https://calla.hgodo.com/product/cable/','{model}-{번호}.jpg',{label:'사용 중',state:'Success'},{button:'수정'}],['thumbnail','https://calla.hgodo.com/thumbnail/','{model}.jpg',{label:'확인 필요',state:'Warning'},{button:'확인'}]]);txt(folder.body,'등록된 경로는 상품 이미지 설정의 폴더 선택과 주소 생성에 사용됩니다.',16,'Regular','text/secondary');}
  const sync=shell('08 · 동기화 설정','동기화 설정','목록 저장 상태와 자동 등록 실행기의 연결을 확인하세요.','동기화 설정',7,[['연결 새로고침']]);
  if(sync){for(const [title,desc,status,state]of [['상품 목록 동기화','서버에 저장된 목록을 자동 등록 실행기에 전달합니다.','정상','Success'],['로컬 자동 등록 실행기','현재 기기의 로그인 세션으로 고도몰 등록을 실행합니다.','연결됨','Success'],['고도몰 소매 / 도매','두 쇼핑몰의 로그인과 등록 권한을 확인합니다.','로그인 필요','Warning'],['네이버 스마트스토어','스토어 연결을 완료하면 등록 대상에 포함할 수 있습니다.','연결 필요','Warning']]){const c=card(sync.body,title,sync.cw,24);const rr=row(c,'Connection',sync.cw-48,24);icon(rr,'link',24);const t=stack(rr,'Copy',1120,'VERTICAL',8);txt(t,title,18,'Medium');txt(t,desc,16,'Regular','text/secondary');spacer(rr);badge(rr,status,state);button(rr,'연결 관리');}txt(sync.body,'화면의 연결 상태·상품·수치는 디자인 검토를 위한 예시입니다.',14,'Regular','text/secondary');}
  return SCREENS.map(s=>({id:s.frame.id,name:s.name}));
}
