// Native Figma builder. The desktop font service preserves Pretendard.
const TOK = {}, STY = {}, COMP = {}, ICON = {}, PAGES = {}, IDS = [];
const FONT = {};
const PENDING = [];
const OUT = {runId:'calla-automate-20260930',steps:[],errors:[]};
function track(n){IDS.push(n.id);return n;}
function hex(h){h=h.replace('#','');return {r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255};}
function paint(key){
  if(key&&key[0]==='#')return {type:'SOLID',color:hex(key)};
  const alias={'bg/canvas':'bg/page','text/muted':'text/secondary','brand/default':'bg/brand','brand/soft':'bg/brand-subtle'};
  if(key==='text/brand'&&TOK['text/brand-strong'])key='text/brand-strong';
  const v=TOK[key]||TOK[alias[key]];
  let p={type:'SOLID',color:{r:0.97,g:0.97,b:0.98}};
  if(v)p=figma.variables.setBoundVariableForPaint(p,'color',v);
  return p;
}
function colorize(n,key,prop='fills'){n[prop]=[paint(key)];}
function bind(n,prop,key){if(TOK[key])n.setBoundVariable(prop,TOK[key]);}
function txt(parent,text,size=14,weight='Regular',color='text/primary',width){
  const n=track(figma.createText());parent.appendChild(n);n.name=text.split('\n')[0].slice(0,64);
  n.fontName=FONT[weight]||FONT.Regular;n.fontSize=size;n.characters=text;
  const st=Object.values(STY).find(s=>s.fontSize===size&&s.fontName.style===n.fontName.style);
  if(st)PENDING.push(n.setTextStyleIdAsync(st.id));else n.lineHeight={unit:'PIXELS',value:Math.ceil(size*1.5)};
  n.fills=[paint(color)];
  if(width){n.textAutoResize='HEIGHT';n.resize(width,Math.ceil(size*1.5));}else n.textAutoResize='WIDTH_AND_HEIGHT';
  return n;
}
function box(parent,name,w,h,fill='bg/surface',radius=12){
  const n=track(figma.createFrame());parent.appendChild(n);n.name=name;n.resize(w,h);n.fills=fill?[paint(fill)]:[];n.clipsContent=false;n.cornerRadius=radius;
  bind(n,'cornerRadius','radius/'+radius);return n;
}
function stack(parent,name,w,direction='VERTICAL',gap=16,padding=0,fill=null){
  const n=box(parent,name,w,1,fill,0);n.layoutMode=direction;n.primaryAxisSizingMode=direction==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=direction==='HORIZONTAL'?'AUTO':'FIXED';
  n.itemSpacing=gap;n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=padding;
  bind(n,'itemSpacing','spacing/'+gap);['paddingTop','paddingBottom','paddingLeft','paddingRight'].forEach(p=>bind(n,p,'spacing/'+padding));
  if(direction==='HORIZONTAL')n.counterAxisAlignItems='CENTER';return n;
}
function line(parent,w){const n=track(figma.createRectangle());parent.appendChild(n);n.name='Divider';n.resize(w,1);n.fills=[paint('border/default')];return n;}
function icon(parent,name,size=20,color='text/secondary'){
  const aliases={plus:'plus.circle','arrow.triangle.2.circlepath':'arrow.clockwise'};
  const c=ICON[name]||ICON[aliases[name]];if(!c)return null;
  const i=track(c.createInstance());parent.appendChild(i);i.resize(size,size);i.name='Icon / '+name;
  for(const n of i.findAll(n=>'fills' in n&&n.type!=='FRAME'&&n.type!=='INSTANCE'))n.fills=[paint(color)];return i;
}
function inst(parent,family,match={},label){
  const set=COMP[family];if(!set)throw Error('Missing component '+family);
  const c=set.type==='COMPONENT_SET'?set.children.find(c=>Object.entries(match).every(([k,v])=>c.variantProperties&&c.variantProperties[k]===v))||set.defaultVariant:set;
  const n=track(c.createInstance());parent.appendChild(n);
  if(label!==undefined){const key=Object.keys(n.componentProperties).find(k=>n.componentProperties[k].type==='TEXT'&&/label|title|value|message/i.test(k));if(key)n.setProperties({[key]:label});else {const t=n.findOne(x=>x.type==='TEXT');if(t)t.characters=label;}}
  if(label!==undefined&&['Badge','Tab','Button'].includes(family)){const tw=[...label].reduce((a,c)=>a+(c===' '?4:c.charCodeAt(0)>255?13:7),0);n.resize(Math.max(family==='Button'?84:family==='Tab'?88:58,tw+(family==='Button'?32:family==='Badge'?30:24)),n.height);}
  return n;
}
async function loadFonts(){
  const fonts=await figma.listAvailableFontsAsync();
  for(const weight of ['Regular','Medium','SemiBold','Bold']){
    const f=fonts.find(f=>f.fontName.family==='Pretendard'&&f.fontName.style.replace(/\s/g,'').toLowerCase()===weight.toLowerCase());
    if(!f)throw Error('Pretendard '+weight+' is unavailable in desktop Figma.');
    FONT[weight]=f.fontName;await figma.loadFontAsync(f.fontName);
  }
}
async function buildIcons(){
  const page=PAGES.icons;await figma.setCurrentPageAsync(page);
  const source=page.children.filter(n=>n.type==='TEXT'&&n.name.startsWith('SF-Pro-Display • '));
  for(const src of source){
    for(const s of src.getStyledTextSegments(['fontName']))await figma.loadFontAsync(s.fontName);
    const name=src.name.split(' • ')[1];let c=page.children.find(n=>n.type==='COMPONENT'&&n.name==='SF/'+name);
    if(!c){c=track(figma.createComponent());page.appendChild(c);c.name='SF/'+name;c.resize(24,24);c.fills=[];
      c.description='Imported using SF Symbols Pro. '+name+'. Monochrome, 24px master, 16/20/24px instances.';
      const clone=src.clone();page.appendChild(clone);const v=track(figma.flatten([clone],c));v.name=name;
      const scale=18/Math.max(v.width,v.height);v.rescale(scale);v.x=(24-v.width)/2;v.y=(24-v.height)/2;v.fills=[paint('text/secondary')];}
    ICON[name]=c;c.x=180+(Object.keys(ICON).length-1)%7*180;c.y=150+Math.floor((Object.keys(ICON).length-1)/7)*120;
    src.visible=false;src.x=-1000;src.y=0;
  }
  const board=stack(page,'SF Symbols Pro · Icon inventory',1320,'VERTICAL',24,32,'bg/surface');board.x=180;board.y=750;
  txt(board,'SF Symbols',32,'SemiBold');txt(board,'SF Symbols Pro에서 가져온 벡터 아이콘 · 24px 원본 / 16 · 20 · 24px 사용',14,'Regular','text/secondary');
  const names=Object.keys(ICON);
  for(let i=0;i<names.length;i+=6){const row=stack(board,'Icon row',1256,'HORIZONTAL',16);for(const name of names.slice(i,i+6)){const cell=stack(row,name,196,'VERTICAL',12,16,'bg/subtle');icon(cell,name,24);txt(cell,name,11,'Regular','text/secondary',164);}}
  OUT.icons=names;return ICON;
}

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

async function run(){
  figma.showUI('<style>body{font:14px system-ui;padding:20px;color:#222}h2{font-size:20px}pre{white-space:pre-wrap;font-size:11px}</style><h2>CALLA AUTOMATE</h2><p id="status">디자인 시스템을 생성하고 있습니다…</p><pre id="report"></pre><script>onmessage=e=>{const m=e.data.pluginMessage;document.getElementById("status").textContent=m.status;document.getElementById("report").textContent=JSON.stringify(m.data,null,2)}</script>',{width:480,height:600});
  try{
    const ds=await buildFoundations();await Promise.all(PENDING);OUT.steps.push('foundations');OUT.foundations=ds.report;
    figma.ui.postMessage({status:'사이드바와 주요 화면을 조립하고 있습니다…',data:{componentFamilies:Object.keys(COMP).length,icons:Object.keys(ICON).length}});
    await buildSidebar();await Promise.all(PENDING);OUT.steps.push('sidebar');
    OUT.screens=await buildScreens();OUT.dialogs=await buildDialogs();await Promise.all(PENDING);OUT.steps.push('screens');
    OUT.prototype=await wirePrototype();
    const ordered=['overview','foundations','components','sidebar','screens','icons'];
    ordered.forEach((k,i)=>figma.root.insertChild(i,PAGES[k]));
    await figma.setCurrentPageAsync(PAGES.screens);
    const first=await figma.getNodeByIdAsync(OUT.screens[0].id);figma.currentPage.selection=[first];figma.viewport.scrollAndZoomIntoView([first]);
    OUT.componentIds=Object.fromEntries(Object.entries(COMP).map(([k,c])=>[k,c.id]));OUT.pageIds=Object.fromEntries(Object.entries(PAGES).map(([k,p])=>[k,p.id]));OUT.createdNodeIds=[...new Set(IDS)];
    OUT.status='complete';figma.ui.postMessage({status:'디자인 생성 완료 · 편집 가능한 화면과 컴포넌트가 저장되었습니다.',data:OUT});
  }catch(e){OUT.status='error';OUT.error=String(e);OUT.stack=e.stack;OUT.createdNodeIds=[...new Set(IDS)];figma.ui.postMessage({status:'작업 중 오류 · 생성된 내용은 보존되었습니다.',data:OUT});}
}
run();
