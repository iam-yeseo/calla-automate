async function buildIcons(){
  await figma.setCurrentPageAsync(PAGES.icons);
  for(const src of SF_SOURCE){
    let c=PAGES.icons.children.find(n=>n.type==='COMPONENT'&&n.name==='SF/'+src.name);
    if(!c){c=track(figma.createComponent());PAGES.icons.appendChild(c);c.name='SF/'+src.name;c.resize(24,24);c.fills=[];c.description='SF Symbols Pro plugin import. Original vector master '+src.sourceId+'; 24px master with SCALE constraints.';
      for(const shape of src.vectors){const v=track(figma.createVector());c.appendChild(v);v.vectorPaths=shape.paths;v.name=src.name;v.resize(shape.w,shape.h);v.x=shape.x;v.y=shape.y;v.fills=[paint('text/secondary')];v.strokes=[];v.constraints={horizontal:'SCALE',vertical:'SCALE'};}
    }
    ICON[src.name]=c;c.x=180+Object.keys(ICON).length%7*170;c.y=160+Math.floor((Object.keys(ICON).length-1)/7)*110;
  }
  const sourceLogo=await figma.getNodeByIdAsync('4:844');
  let lc=PAGES.icons.children.find(n=>n.type==='COMPONENT'&&n.name==='Calla/Logo');
  if(!lc){lc=track(figma.createComponent());PAGES.icons.appendChild(lc);lc.name='Calla/Logo';lc.resize(89,32);lc.fills=[];lc.x=180;lc.y=660;lc.description='Original editable calla logo from Guide / 4:844.';const clone=track(sourceLogo.clone());lc.appendChild(clone);clone.x=clone.y=0;}
  LOGO=lc;
  let board=PAGES.icons.children.find(n=>n.name==='SF Symbols Pro · Inventory');
  if(!board){board=stack(PAGES.icons,'SF Symbols Pro · Inventory',1320,'VERTICAL',24,32,'bg/surface');board.x=180;board.y=800;txt(board,'SF Symbols Pro',36,'SemiBold');txt(board,'플러그인에서 가져온 실제 벡터 27개 · 16 / 20 / 24px 사용 · calla 원본 로고',16,'Regular','text/secondary');
    const names=Object.keys(ICON);for(let i=0;i<names.length;i+=6){const r=stack(board,'Icons',1256,'HORIZONTAL',16);for(const name of names.slice(i,i+6)){const cell=stack(r,name,196,'VERTICAL',16,16,'bg/subtle');icon(cell,name,24);txt(cell,name,12,'Regular','text/secondary',164);}}
  }
  OUT.icons=Object.keys(ICON);return ICON;
}
function logo(parent,w=89){const n=track(LOGO.createInstance());parent.appendChild(n);n.rescale(w/89);return n;}
function round(n,r=12){n.cornerRadius=r;bind(n,'cornerRadius','radius/'+r);return n;}
function stroke(n,k='border/default'){n.strokes=[paint(k)];n.strokeWeight=1;return n;}
function row(parent,name,w,gap=12){return stack(parent,name,w,'HORIZONTAL',gap);}
function spacer(parent){const n=box(parent,'Flexible space',1,1,null,0);n.layoutGrow=1;return n;}
function card(parent,name,w,pad=24){return round(stack(parent,name,w,'VERTICAL',20,pad,'bg/surface'),24);}
function button(parent,label,type='Secondary',state='Default'){return inst(parent,'Button',{Type:type,State:state},label);}
function badge(parent,label,state='Pending'){return inst(parent,'Badge',{State:state},label);}
function field(parent,label,value,w,state='Default'){const f=stack(parent,label,w,'VERTICAL',10);txt(f,label,14,'Medium','text/secondary');const i=inst(f,'Input',{State:state},value);i.resize(w,44);const prop=Object.keys(i.componentProperties).find(k=>k.startsWith('Show icon#'));if(prop)i.setProperties({[prop]:false});return f;}
function check(parent,label,on=false,w=320){const i=inst(parent,'Checkbox',{State:on?'On':'Off'},label);i.resize(w,28);return i;}
function bar(parent,w,pct){const track=box(parent,'Progress track',w,8,'bg/hover',4);const b=box(track,'Completed '+pct+'%',Math.max(2,w*pct/100),8,'brand/default',4);return track;}
