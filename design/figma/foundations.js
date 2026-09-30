/* CALLA AUTOMATE · native Figma development-plugin fragment.
 * Requires root-supplied TOK, STY, COMP, ICON, PAGES, IDS and visual helpers.
 * Uses the library skill's variable, binding, variant-grid and documentation
 * helper patterns, adapted to native Plugin API and the exact Pretendard font.
 * Preserves existing pages, variables and styles; no cleanup or deletion.
 */
async function buildFoundations() {
  const created = { pages: [], variables: [], collections: [], styles: [], nodes: [] };
  const track = (n, kind = 'nodes') => {
    created[kind].push(n.id);
    if (Array.isArray(IDS) && !IDS.includes(n.id)) IDS.push(n.id);
    return n;
  };
  await loadFonts();

  const pageNames = {
    overview: '00 · Overview', foundations: '01 · Foundations',
    components: '02 · Components', sidebar: '03 · Sidebar',
    screens: '04 · Screens', icons: '05 · SF Symbols'
  };
  for (const [key, name] of Object.entries(pageNames)) {
    PAGES[key] = PAGES[key] || figma.root.children.find(p => p.name === name);
    if (!PAGES[key]) { PAGES[key] = track(figma.createPage(), 'pages'); PAGES[key].name = name; }
  }

  const allVars = await figma.variables.getLocalVariablesAsync();
  for (const v of allVars) if (!TOK[v.name]) TOK[v.name] = v;
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const getCollection = name => {
    let c = collections.find(v => v.name === name);
    if (!c) { c = track(figma.variables.createVariableCollection(name), 'collections'); c.renameMode(c.defaultModeId, 'Light'); collections.push(c); }
    return c;
  };
  const rgba = hex => {
    const s = hex.replace('#', '');
    return { r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255, a: 1 };
  };
  const sameColor = (a, b) => a && b && typeof a.r === 'number' && Math.abs(a.r-b.r)<0.0001 && Math.abs(a.g-b.g)<0.0001 && Math.abs(a.b-b.b)<0.0001 && Math.abs((a.a === undefined ? 1:a.a)-b.a)<0.0001;
  function ensureVar(name, type, value, scopes, collectionName, description) {
    let variable = TOK[name] || allVars.find(v => v.name === name && v.resolvedType === type);
    if (!variable) {
      const coll = getCollection(collectionName);
      variable = track(figma.variables.createVariable(name, coll, type), 'variables');
      variable.setValueForMode(coll.defaultModeId, value);
      variable.scopes = scopes;
      variable.setVariableCodeSyntax('WEB', 'var(--automate-' + name.replace(/\//g, '-') + ')');
      variable.description = description || 'CALLA AUTOMATE · ' + name;
      allVars.push(variable);
    }
    TOK[name] = variable;
    return variable;
  }
  function primitive(name, hex) {
    const color = rgba(hex);
    const match = allVars.find(v => v.resolvedType === 'COLOR' && Object.values(v.valuesByMode).some(value => sameColor(value, color)));
    if (match) return match;
    return ensureVar('automate/palette/' + name, 'COLOR', color, [], 'Automate Primitives');
  }
  const palette = {
    white:'#FFFFFF', 'neutral/25':'#F9FAFB','neutral/50':'#F5F6F8','neutral/100':'#F1F3F5',
    'neutral/200':'#E5E7EB','neutral/300':'#D1D5DB','neutral/400':'#9CA3AF','neutral/500':'#6B7280',
    'neutral/600':'#606876','neutral/700':'#374151','neutral/900':'#121212',
    'rose/50':'#FFF0F4','rose/100':'#FFE2EA','rose/300':'#F8B0C2','rose/500':'#F27490',
    'rose/600':'#DF587B','rose/700':'#AE3155','green/50':'#F0FDF4','green/100':'#DCFCE7',
    'green/300':'#86EFAC','green/700':'#15803D','amber/50':'#FFFBEB','amber/100':'#FEF3C7',
    'amber/300':'#FCD34D','amber/800':'#92400E','red/50':'#FEF2F2','red/100':'#FEE2E2',
    'red/300':'#FCA5A5','red/700':'#B91C1C','blue/50':'#EFF6FF','blue/100':'#DBEAFE',
    'blue/300':'#93C5FD','blue/700':'#1D4ED8','purple/50':'#F5F3FF','purple/700':'#6D28D9'
  };
  const primitives = {};
  for (const [name, hex] of Object.entries(palette)) primitives[name] = primitive(name, hex);
  const semantics = {
    'bg/canvas':'neutral/25', 'bg/surface':'white', 'bg/subtle':'neutral/50', 'bg/hover':'neutral/100',
    'bg/selected':'rose/50', 'bg/disabled':'neutral/100', 'text/primary':'neutral/900',
    'text/secondary':'neutral/600', 'text/muted':'neutral/500', 'text/disabled':'neutral/400',
    'text/inverse':'white', 'text/brand-strong':'rose/700', 'border/default':'neutral/200',
    'border/strong':'neutral/300', 'border/focus':'rose/700', 'focus/ring':'rose/700', 'brand/default':'rose/500',
    'brand/hover':'rose/600', 'brand/pressed':'rose/700', 'brand/soft':'rose/50',
    'brand/border':'rose/300', 'success/bg':'green/100','success/text':'green/700','success/border':'green/300',
    'warning/bg':'amber/100','warning/text':'amber/800','warning/border':'amber/300',
    'danger/bg':'red/100','danger/text':'red/700','danger/border':'red/300',
    'info/bg':'blue/100','info/text':'blue/700','info/border':'blue/300',
    'neutral/bg':'neutral/100','neutral/text':'neutral/600','neutral/border':'neutral/200',
    'review/bg':'purple/50','review/text':'purple/700','channel/godomall':'rose/700','channel/naver':'green/700'
  };
  const semanticReuse = {
    'bg/canvas':'bg/page','bg/hover':'bg/muted','bg/selected':'bg/brand-subtle',
    'brand/default':'bg/brand','brand/hover':'bg/brand-hover','brand/pressed':'bg/brand-pressed',
    'brand/soft':'bg/brand-subtle','brand/border':'border/brand',
    'success/bg':'status/success/bg','success/text':'status/success/fg',
    'warning/bg':'status/warning/bg','warning/text':'status/warning/fg',
    'danger/bg':'status/danger/bg','danger/text':'status/danger/fg',
    'info/bg':'status/info/bg','info/text':'status/info/fg',
    'neutral/bg':'status/neutral/bg','neutral/text':'status/neutral/fg'
  };
  for (const [name, primitiveName] of Object.entries(semantics)) {
    if (!TOK[name] && TOK[semanticReuse[name]]) TOK[name] = TOK[semanticReuse[name]];
    const scopes = name.startsWith('text/') || name.endsWith('/text') ? ['TEXT_FILL'] :
      name.startsWith('border/') || name.endsWith('/border') || name==='focus/ring' ? ['STROKE_COLOR'] : ['FRAME_FILL','SHAPE_FILL'];
    ensureVar(name, 'COLOR', { type:'VARIABLE_ALIAS', id:primitives[primitiveName].id }, scopes, 'Automate Color');
  }
  const dimensions = {};
  for (const n of [0,2,4,6,8,10,12,16,20,24,32,40,48,64]) dimensions['spacing/'+n] = [n,['GAP']];
  for (const n of [4,8,10,12,16,24]) dimensions['radius/'+n] = [n,['CORNER_RADIUS']];
  dimensions['radius/full'] = [999,['CORNER_RADIUS']];
  for (const [key,val] of Object.entries({expanded:260,collapsed:60,min:180,max:400})) dimensions['sidebar/'+key]=[val,['WIDTH_HEIGHT']];
  for (const n of [28,36,44]) dimensions['control/'+n]=[n,['WIDTH_HEIGHT']];
  dimensions['border/width']=[1,['STROKE_FLOAT']];
  dimensions['focus/width']=[2,['STROKE_FLOAT']];
  const layoutReuse={'radius/4':'radius/sm','radius/8':'radius/md','radius/12':'radius/lg','radius/16':'radius/xl','control/28':'size/control-sm','control/36':'size/control-md','control/44':'size/control-lg','border/width':'border/width-default'};
  for (const [name,[value,scopes]] of Object.entries(dimensions)) {
    if(!TOK[name]&&TOK[layoutReuse[name]])TOK[name]=TOK[layoutReuse[name]];
    ensureVar(name,'FLOAT',value,scopes,'Automate Layout');
  }

  const styleSpecs = [
    ['Display/32 SemiBold',32,'SemiBold',44], ['Heading/24 SemiBold',24,'SemiBold',34],
    ['Heading/20 SemiBold',20,'SemiBold',28], ['Title/16 Medium',16,'Medium',24],
    ['Body/14 Regular',14,'Regular',22], ['Body/14 Medium',14,'Medium',22],
    ['Caption/12 Regular',12,'Regular',18], ['Caption/12 Medium',12,'Medium',18],
    ['Micro/11 Regular',11,'Regular',16]
  ];
  const localStyles = await figma.getLocalTextStylesAsync();
  for (const [shortName,size,weight,height] of styleSpecs) {
    const name='Automate/'+shortName;
    let s=localStyles.find(v=>v.name===name);
    if (!s) {
      s=track(figma.createTextStyle(),'styles'); s.name=name;
      s.fontName=FONT[weight]; s.fontSize=size;
      s.lineHeight={unit:'PIXELS',value:height}; s.letterSpacing={unit:'PERCENT',value:-1};
      s.description='Pretendard '+weight+' · '+size+'/'+height+' · CALLA AUTOMATE';
    }
    STY[name]=s; STY[shortName]=s; STY[size+'/'+weight]=s;
  }
  await buildIcons();

  // Native adaptations of the skill's binding and component-grid helpers.
  function paint(key) {
    if (!TOK[key]) throw new Error('Missing color token '+key);
    return figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',TOK[key]);
  }
  function fill(n,key) { n.fills=key?[paint(key)]:[]; }
  function stroke(n,key,width=1) {
    n.strokes=key?[paint(key)]:[]; n.strokeWeight=width; n.strokeAlign='INSIDE';
    if (key) n.setBoundVariable('strokeWeight',TOK[width===2?'focus/width':'border/width']);
  }
  function numeric(n,prop,key,value) { n[prop]=value; if(TOK[key]) n.setBoundVariable(prop,TOK[key]); }
  function radius(n,value=8) { numeric(n,'cornerRadius','radius/'+(value===999?'full':value),value); }
  function layout(n,direction='HORIZONTAL',gap=8,padding=0) {
    n.layoutMode=direction; n.primaryAxisSizingMode='FIXED'; n.counterAxisSizingMode='FIXED';
    n.primaryAxisAlignItems='MIN'; n.counterAxisAlignItems='CENTER';
    numeric(n,'itemSpacing','spacing/'+gap,gap);
    for(const p of ['paddingTop','paddingBottom','paddingLeft','paddingRight']) numeric(n,p,'spacing/'+padding,padding);
  }
  function text(parent,content,size=14,weight='Regular',color='text/primary',width) {
    const n=track(txt(parent,content,size,weight,color,width));
    const s=STY[size+'/'+weight];
    if(s) PENDING.push(n.setTextStyleIdAsync(s.id));
    fill(n,color);
    if(width) {n.resize(width,n.height); n.textAutoResize='HEIGHT';}
    return n;
  }
  function frame(parent,name,w,h,fillKey=null,r=0) {
    const n=track(figma.createFrame()); parent.appendChild(n); n.name=name; n.resize(w,h); n.clipsContent=false;
    fill(n,fillKey); if(r)radius(n,r); return n;
  }
  function column(parent,name,w,gap=16,pad=0,fillKey=null) {
    const n=frame(parent,name,w,1,fillKey,pad?16:0);layout(n,'VERTICAL',gap,pad);
    n.primaryAxisSizingMode='AUTO';n.counterAxisAlignItems='MIN'; return n;
  }
  function row(parent,name,w,gap=16) {
    const n=frame(parent,name,w,1);layout(n,'HORIZONTAL',gap,0);n.counterAxisSizingMode='AUTO';return n;
  }
  const iconMainIds={};
  function sf(parent,name,size=18,color='text/secondary') {
    const n=icon(parent,name,size,color);
    if(n){track(n);const aliases={plus:'plus.circle','arrow.triangle.2.circlepath':'arrow.clockwise'};const master=ICON[name]||ICON[aliases[name]];if(master)iconMainIds[n.id]=master.id;}
    return n;
  }
  const exposed={};
  function expose(component,key,node,type='TEXT',defaultValue) {
    if(!exposed[component.id]) exposed[component.id]=[];
    const initial=defaultValue===undefined?(type==='TEXT'?node.characters:iconMainIds[node.id]):defaultValue;
    if(initial===undefined)throw new Error('No imported SF icon main component for '+key);
    exposed[component.id].push({key,node,type,defaultValue:initial});
  }
  function component(name,w,h,fillKey='bg/surface',r=8) {
    const n=track(figma.createComponent());PAGES.components.appendChild(n);n.name=name;n.resize(w,h);n.clipsContent=false;
    fill(n,fillKey);radius(n,r);return n;
  }
  function family(key,variants,columns=4,description='') {
    const existing=PAGES.components.findOne(n=>n.type==='COMPONENT_SET'&&n.name==='Automate/'+key);
    if(existing){COMP[key]=existing;return existing;}
    const set=track(figma.combineAsVariants(variants,PAGES.components));set.name='Automate/'+key;set.description=description;
    const props={};
    for(const variant of variants)for(const def of exposed[variant.id]||[]){
      const propKey=def.type+':'+def.key;
      if(!props[propKey])props[propKey]=set.addComponentProperty(def.key,def.type,def.defaultValue);
      def.node.componentPropertyReferences={...def.node.componentPropertyReferences,[def.type==='TEXT'?'characters':def.type==='BOOLEAN'?'visible':'mainComponent']:props[propKey]};
    }
    const gap=24,pad=24;let yy=pad;
    for(let i=0;i<variants.length;i+=columns){
      let xx=pad,maxH=0;
      for(const n of variants.slice(i,i+columns)){n.x=xx;n.y=yy;xx+=n.width+gap;maxH=Math.max(maxH,n.height);}
      yy+=maxH+gap;
    }
    set.resize(Math.max(...variants.map(n=>n.x+n.width))+pad,yy);set.fills=[];
    COMP[key]=set; return set;
  }
  function existingFamily(name) { const n=PAGES.components.findOne(n=>n.type==='COMPONENT_SET'&&n.name==='Automate/'+name); if(n)COMP[name]=n;return n; }
  await figma.setCurrentPageAsync(PAGES.components);

  if(!existingFamily('Button')) {
    const variants=[];
    for(const Type of ['Primary','Secondary','Ghost','Danger'])for(const State of ['Default','Hover','Focus','Disabled','Loading']) {
      const disabled=State==='Disabled',loading=State==='Loading';
      const bg=disabled?'bg/disabled':Type==='Primary'?(State==='Hover'?'brand/hover':'brand/default'):Type==='Danger'?'danger/bg':State==='Hover'?'bg/hover':Type==='Ghost'?null:'bg/surface';
      const fg=disabled?'text/disabled':Type==='Primary'?'text/primary':Type==='Danger'?'danger/text':'text/primary';
      const n=component('Type='+Type+', State='+State,144,36,bg,8);layout(n,'HORIZONTAL',8,12);n.primaryAxisAlignItems='CENTER';
      numeric(n,'minHeight','control/36',36);
      stroke(n,State==='Focus'?'focus/ring':Type==='Secondary'?'border/default':null,State==='Focus'?2:1);
      numeric(n,'paddingTop','spacing/6',6);numeric(n,'paddingBottom','spacing/6',6);
      const ic=sf(n,loading?'arrow.triangle.2.circlepath':'plus',16,fg);if(ic&&ic.type==='INSTANCE'){expose(n,'Icon',ic,'INSTANCE_SWAP');expose(n,'Show icon',ic,'BOOLEAN',loading);ic.visible=loading;}
      const label=text(n,loading?'처리 중…':Type==='Danger'?'삭제':'버튼',14,'Medium',fg);expose(n,'Label',label);
      variants.push(n);
    }
    family('Button',variants,5,'주요·보조·텍스트·삭제 행동. Primary는 분홍 배경 + 짙은 글자로 대비 확보. Label과 SF Symbols Icon 교체 가능. 저장과 외부 몰 등록 CTA는 구분.');
  }
  if(!existingFamily('Input')){
    const variants=[];
    for(const State of ['Default','Focus','Error','Disabled']){
      const n=component('State='+State,280,44,State==='Disabled'?'bg/disabled':'bg/surface',8);layout(n,'HORIZONTAL',8,12);
      stroke(n,State==='Error'?'danger/text':State==='Focus'?'focus/ring':'border/default',State==='Focus'?2:1);
      const ic=sf(n,'magnifyingglass',16,State==='Disabled'?'text/disabled':'text/secondary');if(ic&&ic.type==='INSTANCE')expose(n,'Icon',ic,'INSTANCE_SWAP');
      if(ic){expose(n,'Show icon',ic,'BOOLEAN',true);}
      numeric(n,'paddingTop','spacing/8',8);numeric(n,'paddingBottom','spacing/8',8);
      const value=text(n,State==='Error'?'입력값을 확인해 주세요':'상품명 또는 모델명 검색',14,'Regular',State==='Disabled'?'text/disabled':'text/secondary',228);value.layoutSizingHorizontal='FILL';value.textTruncation='ENDING';value.maxLines=1;expose(n,'Value',value);
      variants.push(n);
    }
    family('Input',variants,2,'기본·포커스·오류·비활성. 필드 라벨과 오류 메시지는 외부에서 함께 표시. 검색 아이콘은 SF Symbols 인스턴스 교체.');
  }
  const badgeSpecs=[['Pending','등록 대기','neutral'],['Running','등록 중','info'],['Success','등록 완료','success'],['Failed','등록 실패','danger'],['Warning','확인 필요','warning'],['Review','검토 모드','review'],['Paused','일시 중지','neutral'],['Disconnected','연결 필요','warning']];
  if(!existingFamily('Badge')){
    const variants=[];
    for(const [State,label,tone]of badgeSpecs){const n=component('State='+State,88,28,tone+'/bg',999);layout(n,'HORIZONTAL',6,8);numeric(n,'paddingTop','spacing/4',4);numeric(n,'paddingBottom','spacing/4',4);n.primaryAxisAlignItems='CENTER';
      const dot=track(figma.createEllipse());n.appendChild(dot);dot.resize(5,5);fill(dot,tone+'/text');
      expose(n,'Label',text(n,label,12,'Medium',tone+'/text'));variants.push(n);}
    family('Badge',variants,4,'상품과 채널의 운영 상태. 색·텍스트·점 표시를 함께 사용하며 실행 상태와 선택 여부는 구분.');
  }
  if(!existingFamily('Checkbox')){
    const variants=[];
    for(const State of ['Off','On','Mixed','Disabled']){
      const n=component('State='+State,120,28,null,4);layout(n,'HORIZONTAL',8,0);
      const check=frame(n,'Control',18,18,State==='On'||State==='Mixed'?'brand/default':State==='Disabled'?'bg/disabled':'bg/surface',4);stroke(check,'border/strong');layout(check,'HORIZONTAL',0,0);check.primaryAxisAlignItems='CENTER';
      if(State==='On'||State==='Mixed')sf(check,State==='On'?'checkmark':'minus',12,'text/primary');
      expose(n,'Label',text(n,'항목 선택',14,'Regular',State==='Disabled'?'text/disabled':'text/primary'));variants.push(n);}
    family('Checkbox',variants,4,'상품 선택은 일괄 작업 대상 지정이며 등록 완료값을 변경하지 않음. Mixed는 일부 선택 상태.');
  }
  if(!existingFamily('Toggle')){
    const variants=[];
    for(const State of ['Off','On','Disabled']){
      const n=component('State='+State,148,28,null,4);layout(n,'HORIZONTAL',8,0);
      const trackNode=frame(n,'Track',32,20,State==='On'?'brand/default':'border/strong',999);
      const thumb=track(figma.createEllipse());trackNode.appendChild(thumb);thumb.name='Thumb';thumb.resize(16,16);thumb.x=State==='On'?14:2;thumb.y=2;fill(thumb,'bg/surface');
      expose(n,'Label',text(n,'검토 모드',14,'Regular',State==='Disabled'?'text/disabled':'text/primary'));if(State==='Disabled')trackNode.opacity=.4;variants.push(n);}
    family('Toggle',variants,3,'즉시 켜고 끄는 설정. 기본 검토 모드는 켜짐. 중단 요청처럼 확인이 필요한 행동에는 사용하지 않음.');
  }
  if(!existingFamily('Tab')){
    const variants=[];
    for(const State of ['Default','Active','Hover','Disabled']){
      const n=component('State='+State,112,36,State==='Active'?'bg/surface':State==='Hover'?'bg/hover':null,8);layout(n,'HORIZONTAL',4,8);numeric(n,'paddingTop','spacing/6',6);numeric(n,'paddingBottom','spacing/6',6);n.primaryAxisAlignItems='CENTER';
      if(State==='Active')stroke(n,'border/default');
      expose(n,'Label',text(n,'기본 설정',14,State==='Active'?'Medium':'Regular',State==='Disabled'?'text/disabled':State==='Active'?'text/primary':'text/secondary'));variants.push(n);}
    family('Tab',variants,4,'같은 객체의 기본·이미지 설정 전환. 초안·스크롤·입력값은 탭 전환 중 유지.');
  }
  if(!existingFamily('Toast')){
    const variants=[];
    const spec=[['Success','저장되었습니다','checkmark.circle.fill','success'],['Error','저장하지 못했습니다. 다시 시도해 주세요.','exclamationmark.circle.fill','danger'],['Warning','로그인이 필요합니다','exclamationmark.triangle.fill','warning']];
    for(const[State,label,symbol,tone]of spec){
      const n=component('State='+State,380,80,'bg/surface',12);layout(n,'HORIZONTAL',12,16);stroke(n,tone+'/border');
      const ic=sf(n,symbol,20,tone+'/text');if(ic&&ic.type==='INSTANCE')expose(n,'Icon',ic,'INSTANCE_SWAP');
      expose(n,'Message',text(n,label,14,'Regular','text/primary',308));variants.push(n);}
    family('Toast',variants,1,'저장·검증 결과 피드백. 실패 시 입력을 유지하고 재시도 경로 제공. 성공 토스트는 실제 저장 응답 이후 표시.');
  }
  if(!existingFamily('Progress')){
    const variants=[];
    for(const State of ['Running','Paused','Complete']){
      const n=component('State='+State,320,70,null,8);layout(n,'VERTICAL',12,0);n.counterAxisAlignItems='MIN';
      const head=row(n,'Labels',320,8);head.primaryAxisAlignItems='SPACE_BETWEEN';
      expose(n,'Label',text(head,State==='Complete'?'등록 완료':State==='Paused'?'중단 대기':'상품 등록 중',14,'Medium'));
      expose(n,'Value',text(head,State==='Complete'?'24 / 24':'16 / 24',12,'Regular','text/secondary'));
      const bar=frame(n,'Track',320,6,'neutral/bg',999);const active=frame(bar,'Fill',State==='Complete'?320:212,6,State==='Complete'?'success/text':State==='Paused'?'warning/text':'brand/default',999);
      expose(n,'Description',text(n,State==='Paused'?'현재 상품을 마친 뒤 중단합니다.':State==='Complete'?'필요한 채널 등록을 모두 마쳤습니다.':'소비자몰 · 17번째 상품을 처리하고 있습니다.',11,'Regular','text/secondary'));
      variants.push(n);}
    family('Progress',variants,1,'진행률은 실제 대상 상품과 결과에서 계산. 중단 요청은 진행 중인 1건을 마친 뒤 반영.');
  }
  if(!existingFamily('EmptyState')){
    const variants=[];
    for(const[State,title,description,symbol]of [['Empty','등록할 상품이 없습니다','상품을 추가하거나 엑셀 파일을 불러오세요.','tray'],['NoResults','검색 결과가 없습니다','검색어 또는 필터를 바꿔 다시 확인해 보세요.','magnifyingglass'],['Error','목록을 불러오지 못했습니다','연결을 확인한 뒤 다시 시도해 주세요.','exclamationmark.triangle.fill']]){
      const n=component('State='+State,400,168,'bg/surface',16);layout(n,'VERTICAL',12,24);n.primaryAxisAlignItems='CENTER';
      const ic=sf(n,symbol,28,'text/secondary');if(ic&&ic.type==='INSTANCE')expose(n,'Icon',ic,'INSTANCE_SWAP');
      const a=text(n,title,16,'Medium');a.textAlignHorizontal='CENTER';expose(n,'Title',a);
      const b=text(n,description,12,'Regular','text/secondary',352);b.textAlignHorizontal='CENTER';expose(n,'Description',b);variants.push(n);}
    family('EmptyState',variants,1,'빈 데이터·검색 결과 없음·통신 오류를 구분. 다음 행동 버튼은 문맥에 맞게 화면에서 조합.');
  }
  if(!existingFamily('StatCard')){
    const variants=[];
    for(const Tone of ['Default','Accent','Warning']){
      const n=component('Tone='+Tone,244,140,'bg/surface',16);layout(n,'VERTICAL',8,20);n.counterAxisAlignItems='MIN';stroke(n,'border/default');
      const head=row(n,'Heading',204,8);head.primaryAxisAlignItems='SPACE_BETWEEN';
      expose(n,'Title',text(head,Tone==='Warning'?'확인 필요':'등록 대기 상품',12,'Medium','text/secondary'));
      const ic=sf(head,Tone==='Warning'?'exclamationmark.triangle.fill':'shippingbox',18,Tone==='Warning'?'warning/text':'text/secondary');if(ic&&ic.type==='INSTANCE')expose(n,'Icon',ic,'INSTANCE_SWAP');
      expose(n,'Value',text(n,Tone==='Warning'?'3':'24',32,'SemiBold',Tone==='Accent'?'text/brand-strong':'text/primary'));
      expose(n,'Description',text(n,Tone==='Warning'?'카테고리·이미지를 확인해 주세요':'3개 채널 · 저장된 상품 기준',11,'Regular','text/secondary'));variants.push(n);}
    family('StatCard',variants,3,'운영자가 지금 처리해야 하는 수량. 미조회 데이터를 0으로 만들지 않고 로딩 상태를 별도로 표시.');
  }

  // Compact instances on the left; editable masters remain outside review frame.
  let masterY=0;
  for(const key of ['Button','Input','Badge','Checkbox','Toggle','Tab','Toast','Progress','EmptyState','StatCard']){
    const set=COMP[key];set.x=1450;set.y=masterY;masterY+=set.height+80;
  }
  function docsRoot(page,name,title,subtitle,width=1240){
    let root=page.children.find(n=>n.name===name&&n.type==='FRAME');
    if(root)return null;
    root=column(page,name,width,40,48,'bg/surface');root.x=0;root.y=0;
    const header=column(root,'Header',width-96,12);
    text(header,title,32,'SemiBold');text(header,subtitle,14,'Regular','text/secondary',width-96);return root;
  }
  function section(parent,title,description){
    const s=column(parent,'Section / '+title,1144,16);text(s,title,20,'SemiBold');if(description)text(s,description,12,'Regular','text/secondary',1144);return s;
  }
  function tokenValueLabel(key){
    let variable=TOK[key],depth=0;
    while(variable&&depth++<8){const value=Object.values(variable.valuesByMode)[0];
      if(value&&value.type==='VARIABLE_ALIAS'){variable=allVars.find(v=>v.id===value.id);continue;}
      if(value&&typeof value.r==='number')return '#'+[value.r,value.g,value.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('').toUpperCase();
      return String(value);
    }
    return 'Linked token';
  }
  const componentDoc=docsRoot(PAGES.components,'Automate / Components / Review','Components','반복되는 조작을 한 언어로 정리합니다. 아래 항목은 실제 컴포넌트 인스턴스이며, 원본은 오른쪽에 모아 두었습니다.');
  if(componentDoc){
    for(const key of ['Button','Input','Badge','Checkbox','Toggle','Tab','Toast','Progress','EmptyState','StatCard']){
      const set=COMP[key];const s=section(componentDoc,key,set.description);
      const variants=set.children.filter(n=>n.type==='COMPONENT');
      let lineRow=null,x=0;
      for(const variant of variants){
        if(!lineRow||x+variant.width>1144){lineRow=row(s,'Variants',1144,16);x=0;}
        const unit=column(lineRow,variant.name,variant.width,8);text(unit,variant.name,11,'Regular','text/secondary',variant.width);
        const instance=track(variant.createInstance());unit.appendChild(instance);x+=variant.width+16;
      }
    }
  }

  const foundationDoc=docsRoot(PAGES.foundations,'Automate / Foundations / Review','Foundations','기존 CALLTO의 핑크·뉴트럴·Pretendard를 이어받아, 등록 운영에 필요한 의미와 상태를 확장했습니다.');
  if(foundationDoc){
    const colors=section(foundationDoc,'01  Semantic colors','브랜드색은 주요 행동과 선택에, 의미색은 결과와 문제 해결에 사용합니다. 밝은 핑크 위 작은 흰 글자는 피합니다.');
    const groups=[['Brand',['brand/default','brand/hover','brand/soft','text/brand-strong']],['Surface',['bg/canvas','bg/surface','bg/subtle','border/default']],['Text',['text/primary','text/secondary','text/muted','text/disabled']],['Operational',['success/bg','warning/bg','danger/bg','info/bg']]];
    for(const[label,keys]of groups){const rr=row(colors,label,1144,16);for(const key of keys){const card=column(rr,key,274,8);frame(card,'Swatch',274,64,key,12);text(card,key,12,'Medium');text(card,tokenValueLabel(key),11,'Regular','text/secondary');}}
    const type=section(foundationDoc,'02  Typography','Pretendard · Regular / Medium / SemiBold. 본문은 편안하게, 숫자와 제목은 필요한 만큼만 강조합니다.');
    for(const[shortName,size,weight,height]of styleSpecs){const rr=row(type,shortName,1144,24);text(rr,size+' / '+height+' · '+weight,12,'Regular','text/secondary',224);text(rr,size>=20?'상품 등록을 한곳에서 관리하세요':'상품 정보부터 채널 등록까지, 차분하고 명확하게.',size,weight,'text/primary',896);}
    const spacing=section(foundationDoc,'03  Spacing & geometry','4px 기반 리듬, 조밀한 운영 테이블과 넉넉한 편집 영역. 컨트롤 28 / 36 / 44, 카드 16, 사이드 메뉴 10.');
    const sr=row(spacing,'Spacing scale',1144,24);for(const n of [4,8,12,16,24,32,48,64]){const cell=column(sr,'Space '+n,116,12);frame(cell,'Bar',n,24,'brand/default',4);text(cell,n+' px',12,'Medium');}
    text(spacing,'Sidebar   260px expanded   /   60px collapsed   /   180–400px resizable',14,'Medium');
    const behavior=section(foundationDoc,'04  Focus & motion','키보드 포커스는 짙은 핑크 2px. 사이드 메뉴 펼침 240ms, 항목 색상 150ms, 눌림 120ms. 움직임 줄이기 설정에서는 모션을 생략합니다.');
    const br=row(behavior,'Focus examples',1144,16);for(const key of ['Button','Input']){const v=COMP[key].children.find(n=>n.type==='COMPONENT'&&n.name.includes('State=Focus'));if(v){const i=track(v.createInstance());br.appendChild(i);}}
    text(behavior,'선택·완료·실패는 색상만으로 표현하지 않습니다. 텍스트와 실제 SF Symbols 아이콘을 함께 사용합니다.',12,'Regular','text/secondary',1144);
  }

  const overview=docsRoot(PAGES.overview,'Automate / Overview / Review','CALLA AUTOMATE','상품 요청부터 고도몰·스마트스토어 등록까지, 한 흐름으로 관리하는 운영 워크스페이스.');
  if(overview){
    const hero=column(overview,'Purpose',1144,16,32,'brand/soft');text(hero,'작업은 선명하게.\n반복은 자동으로.',32,'SemiBold','text/primary',1080);text(hero,'핑크는 주요 행동에, 여백은 집중에. 기존 CALLTO의 디자인 맥락을 유지하고 대시보드 운영 흐름으로 확장합니다.',14,'Regular','text/secondary',1080);
    const map=section(overview,'File guide','기존 원본과 레퍼런스 페이지는 그대로 보존합니다. 이번 작업은 아래 6개 페이지에서 관리합니다.');
    for(const[key,name]of Object.entries(pageNames)){
      const descriptions={overview:'맥락과 사용 원칙',foundations:'컬러·타이포그래피·간격·모션',components:'실제 상태별 컴포넌트와 인스턴스',sidebar:'확장·축소·중첩·플로팅·크기 조절',screens:'대시보드·상품·자동 등록·설정',icons:'SF Symbols Pro에서 가져온 아이콘'};
      const rr=row(map,name,1144,24);text(rr,name,16,'Medium','text/primary',300);text(rr,descriptions[key],14,'Regular','text/secondary',820);
    }
    const flow=section(overview,'Product workflow','상품 작성과 외부 몰 등록을 서로 다른 행동으로 명확히 안내합니다.');
    const rr=row(flow,'Four steps',1144,16);for(const[num,title,body]of [['01','상품 준비','리스트 생성 · 엑셀 가져오기\n브랜드·카테고리·가격·이미지'],['02','저장 및 확인','초안 → 서버 저장\n누락 항목과 채널 연결 확인'],['03','등록 실행','대상 상품과 채널 선택\n검토 모드 · 로그인 · 실행'],['04','결과 확인','채널별 성공·실패·상품번호\n부분 실패 수정 후 재시도']]){const c=column(rr,title,274,12,20,'bg/subtle');text(c,num,12,'Medium','text/brand-strong');text(c,title,16,'Medium');text(c,body,12,'Regular','text/secondary',234);}
    const principles=section(overview,'Design principles','읽기 쉬운 정보 밀도 / 현재 위치가 분명한 사이드 메뉴 / 되돌릴 수 있는 편집 / 오류 뒤의 다음 행동');
    text(principles,'등록 필요와 실제 등록 결과를 구분합니다. 목록 저장 성공 이후에만 공유 완료를 표시하고, 등록 완료는 필요한 채널의 성공 결과로 판단합니다. 데이터 예시는 디자인 검토용입니다.',14,'Regular','text/secondary',1144);
    text(principles,'아이콘 출처: SF Symbols Pro 플러그인. 라이브러리의 실제 벡터 인스턴스를 재사용합니다. 새 디자인에는 Pretendard를 그대로 사용합니다.',12,'Regular','text/secondary',1144);
  }

  const counts=Object.fromEntries(Object.entries(COMP).filter(([key])=>['Button','Input','Badge','Checkbox','Toggle','Tab','Toast','Progress','EmptyState','StatCard'].includes(key)).map(([key,set])=>[key,set.children.length]));
  const expected={Button:20,Input:4,Badge:8,Checkbox:4,Toggle:3,Tab:4,Toast:3,Progress:3,EmptyState:3,StatCard:3};
  for(const[key,count]of Object.entries(expected))if(counts[key]!==count)throw new Error(key+' variants: '+counts[key]+' expected '+count);
  return {pages:PAGES,vars:TOK,styles:STY,components:COMP,icons:ICON,helpers:{paint,fill,stroke,numeric,radius,layout,text,frame,column,row,sf},
    report:{created,pageIds:Object.fromEntries(Object.entries(PAGES).map(([k,v])=>[k,v.id])),componentIds:Object.fromEntries(Object.entries(COMP).map(([k,v])=>[k,v.id])),variantCounts:counts,tokenCount:Object.keys(TOK).length,textStyleCount:styleSpecs.length,font:'Pretendard',reviewFrameIds:[componentDoc,foundationDoc,overview].filter(Boolean).map(n=>n.id)}};
}
