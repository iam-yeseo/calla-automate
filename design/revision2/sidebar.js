/* CALLA 상품 등록 툴 · Sidebar library.
 * Reads the supplied sidebar reference as design requirements only.
 * Native Figma builder fragment: requires the shared layout / token helpers.
 */
// INSTANCE_SWAP reinstates the imported symbol paint. Apply this after each swap
// and after changing the NavItem state in a composed screen.
function applySidebarIconForeground(nav) {
  const state=nav.variantProperties && nav.variantProperties.State;
  if(!state || !('findOne' in nav))return [];
  const symbol=nav.findOne(n=>n.name==='Nav icon');if(!symbol)return [];
  const target=state==='Active'?{type:'SOLID',color:{r:1,g:1,b:1},opacity:1}:paint('text/secondary');
  const ids=[];
  for(const shape of symbol.findAll(n=>['VECTOR','BOOLEAN_OPERATION','RECTANGLE','ELLIPSE','POLYGON','STAR','LINE'].includes(n.type))){
    if('fills' in shape && Array.isArray(shape.fills) && shape.fills.length){shape.fills=[target];ids.push(shape.id);}
    if('strokes' in shape && Array.isArray(shape.strokes) && shape.strokes.length){shape.strokes=[target];if(!ids.includes(shape.id))ids.push(shape.id);}
  }
  return ids;
}
function repairSidebarIconForeground(page) {
  const nodes=page.findAll(n=>(n.type==='COMPONENT'||n.type==='INSTANCE')&&n.variantProperties&&n.variantProperties.State&&
    (n.name.startsWith('Nav / ')||n.name.startsWith('Nested / ')||n.parent&&n.parent.name==='Calla/NavItem'));
  return {items:nodes.length,changed:nodes.flatMap(applySidebarIconForeground)};
}
async function wireSidebarComponentInteractions() {
  const wired=[];
  const transition={type:'SMART_ANIMATE',easing:{type:'CUSTOM_CUBIC_BEZIER',easingFunctionCubicBezier:{x1:.23,y1:1,x2:.32,y2:1}},duration:.24};
  async function change(trigger,target){
    if(!trigger||!target)return;
    await trigger.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:target.id,navigation:'CHANGE_TO',transition}]}]);
    wired.push({trigger:trigger.id,target:target.id});
  }
  const side=COMP.Sidebar || PAGES.sidebar.children.find(n=>n.name==='Calla/Sidebar');
  if(side && side.type==='COMPONENT_SET'){
    const expanded=side.children.find(n=>n.variantProperties.Mode==='Expanded');
    const collapsed=side.children.find(n=>n.variantProperties.Mode==='Collapsed');
    if(expanded&&collapsed){
      await change(expanded.findOne(n=>n.name==='Sidebar toggle') || expanded.findOne(n=>n.name==='Workspace header'),collapsed);
      await change(collapsed.findOne(n=>n.name==='Workspace header'),expanded);
    }
  }
  const group=COMP.NavGroup || PAGES.sidebar.children.find(n=>n.name==='Calla/NavGroup');
  if(group && group.type==='COMPONENT_SET'){
    const expanded=group.children.find(n=>n.variantProperties.State==='Expanded');
    const collapsed=group.children.find(n=>n.variantProperties.State==='Collapsed');
    if(expanded&&collapsed){
      await change(expanded.findOne(n=>n.name==='Disclosure trigger'),collapsed);
      await change(collapsed.findOne(n=>n.name==='Disclosure trigger'),expanded);
    }
  }
  return wired;
}

async function buildSidebar() {
  const page=PAGES.sidebar;
  await figma.setCurrentPageAsync(page);
  const made=[], sets={};
  const remember=n=>{made.push(n.id);return track(n);};
  const existing=name=>page.children.find(n=>n.name===name);
  const setDescription='Sidemenu-prompt.md · 260px expanded / 60px collapsed / 180–400px resizable. 64px header, 10px active pill, 20px SF Symbols. Collapse 240ms cubic-bezier(.23,1,.32,1); reduced motion 0ms. Focus 2px. Scroll navigation independently and show labels as tooltips in icon rail.';
  function fixed(n,w,h){n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='FIXED';return n;}
  function component(name,w,h,layout='HORIZONTAL'){
    const c=remember(figma.createComponent());page.appendChild(c);c.name=name;c.resize(w,h);
    c.layoutMode=layout;c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';
    c.primaryAxisAlignItems='MIN';c.counterAxisAlignItems=layout==='HORIZONTAL'?'CENTER':'MIN';
    c.fills=[];c.clipsContent=false;return c;
  }
  function divider(parent,w){const n=remember(figma.createRectangle());parent.appendChild(n);n.name='Divider';n.resize(w,1);n.fills=[paint('border/default')];return n;}
  function groupLabel(parent,label,w){const n=txt(parent,label,12,'Medium','text/muted',w);n.name='Section / '+label;return n;}
  function bindNavProperties(set,variants){
    const label=set.addComponentProperty('Label','TEXT','등록 요청 상품');
    const count=set.addComponentProperty('Count','TEXT','6');
    const show=set.addComponentProperty('Show count','BOOLEAN',false);
    const swap=set.addComponentProperty('Icon','INSTANCE_SWAP',ICON['list.bullet.rectangle'].id);
    for(const c of variants){
      const i=c.findOne(n=>n.name==='Nav icon');if(i)i.componentPropertyReferences={mainComponent:swap};
      const l=c.findOne(n=>n.name==='Nav label');if(l)l.componentPropertyReferences={characters:label};
      const b=c.findOne(n=>n.name==='Count');if(b)b.componentPropertyReferences={visible:show};
      const t=c.findOne(n=>n.name==='Count label');if(t)t.componentPropertyReferences={characters:count};
      applySidebarIconForeground(c);
    }
  }
  let navSet=existing('Calla/NavItem');
  if(!navSet){
    const variants=[];
    for(const mode of ['Expanded','Collapsed'])for(const state of ['Default','Hover','Active','Focus','Disabled']){
      const c=component('Mode='+mode+', State='+state,mode==='Expanded'?236:44,44);
      c.paddingLeft=c.paddingRight=12;c.itemSpacing=10;c.cornerRadius=10;
      bind(c,'cornerRadius','radius/10');bind(c,'paddingLeft','spacing/12');bind(c,'paddingRight','spacing/12');bind(c,'itemSpacing','spacing/10');
      c.fills=state==='Active'?[paint('brand/default')]:state==='Hover'?[paint('bg/hover')]:[];
      if(state==='Focus'){c.strokes=[paint('border/focus')];c.strokeWeight=2;c.strokeAlign='OUTSIDE';}
      if(state==='Disabled')c.opacity=.4;
      const fg=state==='Active'?'#FFFFFF':'text/secondary';
      const i=icon(c,'list.bullet.rectangle',20,fg);if(i)i.name='Nav icon';
      if(mode==='Expanded'){
        const label=txt(c,'등록 요청 상품',14,'Medium',fg,158);label.name='Nav label';label.layoutSizingHorizontal='FILL';label.textTruncation='ENDING';label.maxLines=1;
        const count=round(stack(c,'Count',26,'HORIZONTAL',0,0,null),6);fixed(count,26,22);count.primaryAxisAlignItems='CENTER';
        count.fills=state==='Active'?[{type:'SOLID',color:{r:1,g:1,b:1},opacity:.2}]:[paint('bg/hover')];
        const ct=txt(count,'6',12,'Medium',fg);ct.name='Count label';count.visible=false;
      }
      variants.push(c);
    }
    navSet=remember(figma.combineAsVariants(variants,page));navSet.name='Calla/NavItem';navSet.description='Default, hover, active, keyboard focus and disabled states. Solid #F27490 active background always has #FFFFFF label, icon and count. Optional count and icon swap.';
    bindNavProperties(navSet,variants);
    variants.forEach((c,i)=>{c.x=24+(i%5)*268;c.y=44+Math.floor(i/5)*82;});navSet.resize(1380,208);navSet.x=180;navSet.y=140;
  }
  COMP.NavItem=navSet;sets.NavItem=navSet.id;
  function nav(parent,label,symbol,w,collapsed=false,active=false,count){
    const n=inst(parent,'NavItem',{Mode:collapsed?'Collapsed':'Expanded',State:active?'Active':'Default'},collapsed?undefined:label);
    n.name='Nav / '+label;n.resize(w,44);
    const props=n.componentProperties, swap=Object.keys(props).find(k=>props[k].type==='INSTANCE_SWAP');
    if(swap&&ICON[symbol])n.setProperties({[swap]:ICON[symbol].id});
    if(count!==undefined&&!collapsed){
      const ck=Object.keys(props).find(k=>k.startsWith('Count#')),sk=Object.keys(props).find(k=>k.startsWith('Show count#'));
      if(ck&&sk)n.setProperties({[ck]:String(count),[sk]:true});
    }
    applySidebarIconForeground(n);
    return n;
  }
  let sidebarSet=existing('Calla/Sidebar');
  if(!sidebarSet){
    const sides=[];
    for(const mode of ['Expanded','Collapsed','Floating','Resizable']){
      const collapsed=mode==='Collapsed',w=collapsed?60:mode==='Resizable'?320:260;
      const c=component('Mode='+mode,w,900,'VERTICAL');c.fills=[paint('bg/surface')];c.itemSpacing=0;c.strokes=[paint('border/default')];c.strokeWeight=1;c.strokeAlign='INSIDE';
      bind(c,'width',collapsed?'sidebar/collapsed':mode==='Resizable'?'sidebar/expanded':'sidebar/expanded');
      // Resizable is shown at 320px. Bounds remain in the variables and description.
      if(mode==='Resizable'){c.setBoundVariable('width',null);c.resize(320,900);}
      if(mode==='Floating'){
        round(c,16);c.effects=[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:.08},offset:{x:0,y:8},radius:24,spread:-6,visible:true,blendMode:'NORMAL'}];
      }
      const header=row(c,'Workspace header',w,10);fixed(header,w,64);header.paddingLeft=header.paddingRight=collapsed?18:20;
      icon(header,'shippingbox',collapsed?24:20,'text/secondary');
      if(!collapsed){const title=txt(header,'상품 운영',14,'Medium','text/primary',132);title.layoutSizingHorizontal='FILL';const toggle=round(row(header,'Sidebar toggle',28,0),10);fixed(toggle,28,28);toggle.primaryAxisAlignItems='CENTER';icon(toggle,'sidebar.left',18,'text/secondary');}
      divider(c,w);
      const navigation=stack(c,'Scrollable navigation',w,'VERTICAL',6,collapsed?8:12);navigation.layoutGrow=1;navigation.clipsContent=true;
      const nw=w-(collapsed?16:24);
      if(!collapsed){groupLabel(navigation,'상품 등록',nw);box(navigation,'Heading gap',1,4,null,0);}
      nav(navigation,'등록 요청 상품','list.bullet.rectangle',nw,collapsed,true,6);
      nav(navigation,'자동 상품 등록','bolt',nw,collapsed);
      box(navigation,'Section gap',1,20,null,0);
      if(!collapsed){groupLabel(navigation,'설정',nw);box(navigation,'Heading gap',1,4,null,0);}
      nav(navigation,'상품 인덱싱','shippingbox',nw,collapsed);
      nav(navigation,'상품 카테고리','list.bullet.rectangle',nw,collapsed);
      nav(navigation,'서버 이미지 폴더','photo',nw,collapsed);
      const footer=stack(c,'Footer',w,'VERTICAL',12,collapsed?8:12);divider(footer,nw);
      nav(footer,'실시간 동기화','arrow.clockwise',nw,collapsed);
      const user=row(footer,'Workspace user',nw,10);fixed(user,nw,48);user.paddingLeft=user.paddingRight=collapsed?8:10;
      const avatar=round(stack(user,'Avatar',28,'HORIZONTAL',0,0,'brand/soft'),14);fixed(avatar,28,28);avatar.primaryAxisAlignItems='CENTER';txt(avatar,'임',12,'Medium','text/brand-strong');
      if(!collapsed){const details=stack(user,'User information',nw-88,'VERTICAL',1);txt(details,'임예서',14,'Medium');txt(details,'상품 운영 관리자',12,'Regular','text/muted');spacer(user);icon(user,'chevron.down',14,'text/secondary');}
      if(mode==='Resizable'){
        const handle=box(c,'Drag handle · 180–400 px',4,52,'border/strong',2);handle.layoutPositioning='ABSOLUTE';handle.x=w-2;handle.y=424;
      }
      sides.push(c);
    }
    sidebarSet=remember(figma.combineAsVariants(sides,page));sidebarSet.name='Calla/Sidebar';sidebarSet.description=setDescription;sidebarSet.x=180;sidebarSet.y=460;
    let x=24;for(const c of sides){c.x=x;c.y=44;x+=c.width+32;}sidebarSet.resize(x-8,968);
  }
  COMP.Sidebar=sidebarSet;sets.Sidebar=sidebarSet.id;

  let nested=existing('Calla/NavGroup');
  if(!nested){
    const groups=[];
    for(const state of ['Collapsed','Expanded']){
      const c=component('State='+state,236,state==='Expanded'?188:44,'VERTICAL');c.itemSpacing=4;
      const trigger=row(c,'Disclosure trigger',236,10);fixed(trigger,236,44);trigger.paddingLeft=trigger.paddingRight=12;trigger.cornerRadius=10;
      icon(trigger,'link',20,'text/secondary');const label=txt(trigger,'등록 채널',14,'Medium','text/secondary',158);label.name='Group label';label.layoutSizingHorizontal='FILL';icon(trigger,state==='Expanded'?'chevron.down':'chevron.right',14,'text/secondary');
      if(state==='Expanded'){
        const children=stack(c,'Nested navigation',236,'VERTICAL',4);children.paddingLeft=30;children.paddingRight=0;
        for(const [i,name]of ['고도몰 소매','고도몰 도매','스마트스토어'].entries()){
          const item=nav(children,name,'shippingbox',206,false,i===0);item.name='Nested / '+name;
          const ic=item.findOne(n=>n.name==='Nav icon');if(ic)ic.visible=false;
        }
      }
      groups.push(c);
    }
    nested=remember(figma.combineAsVariants(groups,page));nested.name='Calla/NavGroup';nested.description='Reusable disclosure group. Chevron indicates open / closed state; nested items have 30px indentation. Keep actual navigation items independent from the disclosure trigger. aria-expanded tracks this state.';nested.x=180;nested.y=1550;
    const label=nested.addComponentProperty('Label','TEXT','등록 채널');for(const c of groups){c.x=c===groups[0]?24:284;c.y=40;const t=c.findOne(n=>n.name==='Group label');if(t)t.componentPropertyReferences={characters:label};}nested.resize(544,252);
  }
  COMP.NavGroup=nested;sets.NavGroup=nested.id;

  let tooltip=existing('Calla/Tooltip');
  if(!tooltip){
    tooltip=component('Calla/Tooltip',152,36);tooltip.cornerRadius=8;tooltip.paddingLeft=tooltip.paddingRight=12;tooltip.primaryAxisAlignItems='CENTER';tooltip.fills=[paint('text/primary')];
    const label=txt(tooltip,'등록 요청 상품',12,'Medium','#FFFFFF');label.name='Tooltip label';const p=tooltip.addComponentProperty('Label','TEXT','등록 요청 상품');label.componentPropertyReferences={characters:p};
    tooltip.description='Collapsed sidebar tooltip. Present on pointer hover and keyboard focus. 8px gap from rail item; keep the same accessible label on the item. Dismiss with Escape.';tooltip.x=840;tooltip.y=1590;
  }
  COMP.Tooltip=tooltip;sets.Tooltip=tooltip.id;

  if(!existing('Sidebar · 사용 기준')){
    const sheet=stack(page,'Sidebar · 사용 기준',1440,'VERTICAL',24,32,'bg/surface');made.push(sheet.id);sheet.x=180;sheet.y=1900;
    txt(sheet,'상품 운영을 위한 사이드바',28,'SemiBold');
    txt(sheet,'상품 등록과 설정을 구분하고, 접힌 상태에서도 SF Symbols와 툴팁으로 메뉴를 찾을 수 있습니다.',16,'Regular','text/secondary',1376);
    const previews=row(sheet,'Sidebar modes',1376,28);previews.counterAxisAlignItems='MIN';
    for(const [mode,title]of [['Expanded','기본 · 260px'],['Collapsed','접힘 · 60px'],['Floating','플로팅 · 260px'],['Resizable','크기 조절 · 180–400px']]){
      const w=mode==='Collapsed'?130:mode==='Resizable'?320:260;
      const cell=stack(previews,title,w,'VERTICAL',12);txt(cell,title,12,'Medium','text/secondary',w);
      const sample=inst(cell,'Sidebar',{Mode:mode});sample.resize(sample.width,660);
    }
    txt(sheet,'컬러 규칙',18,'Medium');txt(sheet,'활성 메뉴: #F27490 배경 + #FFFFFF 라벨·아이콘·카운트. Hover는 뉴트럴 표면, 키보드 포커스는 2px 외곽선으로 구분합니다.',14,'Regular','text/secondary',1376);
    const detail=row(sheet,'Nested and tooltip examples',1376,32);detail.counterAxisAlignItems='MIN';
    const nestedDoc=stack(detail,'Disclosure pattern',544,'VERTICAL',12);txt(nestedDoc,'하위 메뉴 · 펼침 / 접힘',16,'Medium');const nr=row(nestedDoc,'Nested group states',544,24);inst(nr,'NavGroup',{State:'Collapsed'});inst(nr,'NavGroup',{State:'Expanded'});
    const railDoc=stack(detail,'Rail tooltip pattern',440,'VERTICAL',12);txt(railDoc,'접힘 메뉴 · 툴팁',16,'Medium');const tr=row(railDoc,'Focus and tooltip',440,8);inst(tr,'NavItem',{Mode:'Collapsed',State:'Focus'});inst(tr,'Tooltip',{},'등록 요청 상품');
    txt(sheet,'인터랙션 · 접근성',18,'Medium');
    txt(sheet,'접기 240ms · cubic-bezier(.23, 1, .32, 1) · Reduced motion 0ms\n내비게이션은 별도 스크롤 · 툴팁은 hover와 키보드 focus에 표시 · 64px 헤더 / 최소 52px\n크기 조절은 180–400px · 방향키 16px / Shift+방향키 48px · Home/End 최소/최대 · 더블클릭 기본 폭 복귀',14,'Regular','text/secondary',1376);
  }
  const iconRepair=repairSidebarIconForeground(page);
  const interactions=await wireSidebarComponentInteractions();
  return {sets,created:made,iconRepair,interactions,modes:['Expanded','Collapsed','Floating','Resizable'],widths:{expanded:260,collapsed:60,min:180,max:400},activeForeground:'#FFFFFF'};
}
