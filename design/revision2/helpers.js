// Native Figma builder. The desktop font service preserves Pretendard.
const TOK = {}, STY = {}, COMP = {}, ICON = {}, PAGES = {}, IDS = [];
const FONT = {};
let LOGO;
const SCREENS=[];
const PENDING = [];
const OUT = {runId:'calla-corrected-file-20260930',steps:[],errors:[]};
function track(n){IDS.push(n.id);return n;}
function hex(h){h=h.replace('#','');return {r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255};}
function paint(key){
  if(key&&key[0]==='#')return {type:'SOLID',color:hex(key)};
  const alias={'bg/canvas':'bg/page','text/muted':'text/secondary','brand/default':'bg/brand','brand/soft':'bg/brand-subtle'};
  if(key==='text/brand'&&TOK['text/brand-strong'])key='text/brand-strong';
  const v=TOK[key]||TOK[alias[key]];
  let value=v?v.resolveForConsumer(figma.currentPage).value:null;
  let p={type:'SOLID',color:value&&typeof value.r==='number'?{r:value.r,g:value.g,b:value.b}:{r:0.97,g:0.97,b:0.98}};
  if(v)p=figma.variables.setBoundVariableForPaint(p,'color',v);
  return p;
}
function colorize(n,key,prop='fills'){n[prop]=[paint(key)];}
function bind(n,prop,key){if(TOK[key])n.setBoundVariable(prop,TOK[key]);}
function txt(parent,text,size=14,weight='Regular',color='text/primary',width){
  const n=track(figma.createText());parent.appendChild(n);n.name=text.split('\n')[0].slice(0,64);
  n.fontName=FONT[weight]||FONT.Regular;n.fontSize=size;n.characters=text;
  const st=Object.values(STY).find(s=>s.fontSize===size&&s.fontName.style===n.fontName.style);
  if(st)PENDING.push(n.setTextStyleIdAsync(st.id).then(()=>{n.fills=[paint(color)];}));else n.lineHeight={unit:'PIXELS',value:Math.ceil(size*1.5)};
  n.fills=[paint(color)];
  if(width){n.resize(width,Math.ceil(size*1.5));n.textAutoResize='HEIGHT';}else n.textAutoResize='WIDTH_AND_HEIGHT';
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
  const i=track(c.createInstance());parent.appendChild(i);i.rescale(size/24);i.name='Icon / '+name;
  for(const n of i.findAll(n=>'fills' in n&&n.type!=='FRAME'&&n.type!=='INSTANCE'))n.fills=[paint(color)];return i;
}
function inst(parent,family,match={},label){
  const set=COMP[family];if(!set)throw Error('Missing component '+family);
  const c=set.type==='COMPONENT_SET'?set.children.find(c=>Object.entries(match).every(([k,v])=>c.variantProperties&&c.variantProperties[k]===v))||set.defaultVariant:set;
  const n=track(c.createInstance());parent.appendChild(n);
  if(label!==undefined){const key=Object.keys(n.componentProperties).find(k=>n.componentProperties[k].type==='TEXT'&&/label|title|value|message/i.test(k));if(key)n.setProperties({[key]:label});else {const t=n.findOne(x=>x.type==='TEXT');if(t)t.characters=label;}}
  if(label!==undefined&&['Badge','Tab','Button'].includes(family)){const t=n.findOne(x=>x.type==='TEXT');const tw=t?t.width:label.length*14;n.resize(Math.max(family==='Button'?96:family==='Tab'?100:64,tw+(family==='Button'?36:family==='Badge'?32:28)),n.height);}
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
