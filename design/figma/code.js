async function polish(){
  figma.showUI('<style>body{font:14px system-ui;padding:20px}pre{white-space:pre-wrap}</style><h3>calla · 최종 검수</h3><pre id="r">아이콘과 대화상자를 보정하고 있습니다.</pre><script>onmessage=e=>document.getElementById("r").textContent=JSON.stringify(e.data.pluginMessage,null,2)</script>',{width:480,height:380});
  try{
    const original=await figma.getNodeByIdAsync('4:844');if(!original||original.name!=='calla 2')throw Error('Wrong file');
    for(const f of(await figma.listAvailableFontsAsync()).filter(f=>f.fontName.family==='Pretendard'))await figma.loadFontAsync(f.fontName);
    const ids=[];const pages=figma.root.children.filter(p=>/^0[0-5] · /.test(p.name));
    const whiteVar=(await figma.variables.getLocalVariablesAsync()).find(v=>v.name==='text/inverse');const white=figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',whiteVar);
    for(const p of pages){await figma.setCurrentPageAsync(p);for(const n of p.findAll(n=>n.type==='COMPONENT'||n.type==='INSTANCE')){
      let family,state,type;if(n.type==='COMPONENT'&&n.parent.type==='COMPONENT_SET'){family=n.parent.name;state=n.variantProperties.State;type=n.variantProperties.Type;}else if(n.type==='INSTANCE'){const mc=await n.getMainComponentAsync();if(mc&&mc.parent&&mc.parent.type==='COMPONENT_SET'){family=mc.parent.name;state=n.componentProperties.State?.value;type=n.componentProperties.Type?.value;}}
      if((family==='Calla/NavItem'&&state==='Active')||(family==='Calla/Button'&&type==='Primary'&&state!=='Disabled'))for(const t of n.findAll(x=>x.type==='TEXT'||x.type==='VECTOR')){t.fills=[white];ids.push(t.id);}
    }}
    const screen=await figma.getNodeByIdAsync('13:4130');await figma.setCurrentPageAsync(screen);
    for(const id of ['13:7739','13:7862']){
      const m=await figma.getNodeByIdAsync(id);if(m.children.some(c=>c.name==='Scrollable fields'))continue;
      const old=[...m.children];const middle=old.slice(2,-2);const sc=figma.createFrame();m.insertChild(2,sc);sc.name='Scrollable fields';sc.resize(m.width-64,640);sc.layoutMode='VERTICAL';sc.primaryAxisSizingMode='FIXED';sc.counterAxisSizingMode='FIXED';sc.fills=[];sc.clipsContent=true;sc.overflowDirection='VERTICAL';
      const content=figma.createFrame();sc.appendChild(content);content.name='Form content';content.resize(m.width-64,1);content.layoutMode='VERTICAL';content.primaryAxisSizingMode='AUTO';content.counterAxisSizingMode='FIXED';content.itemSpacing=20;content.fills=[];content.clipsContent=false;for(const child of middle)content.appendChild(child);
      m.resize(m.width,960);m.primaryAxisSizingMode='FIXED';sc.layoutGrow=1;ids.push(sc.id,content.id,m.id);
    }
    const html=await figma.getNodeByIdAsync('13:7975');html.resize(696,66);html.textAutoResize='HEIGHT';ids.push(html.id);
    const imageDialog=await figma.getNodeByIdAsync('13:7862');for(const t of imageDialog.findAllWithCriteria({types:['TEXT']}))if(t.characters.includes('ptz1271-12a-')&&!t.characters.includes('avmatrix-ptz1271-12a-')){t.characters=t.characters.replace(/ptz1271-12a-/g,'avmatrix-ptz1271-12a-');ids.push(t.id);}
    const sync=await figma.getNodeByIdAsync('13:7530');for(const n of sync.findAll(n=>n.type==='INSTANCE'&&n.name==='Nav / 실시간 동기화')){n.setProperties({State:'Active'});for(const t of n.findAll(x=>x.type==='TEXT'||x.type==='VECTOR'))t.fills=[white];ids.push(n.id);}
    const sidebarPage=await figma.getNodeByIdAsync('13:4129');await figma.setCurrentPageAsync(sidebarPage);
    for(const family of ['Calla/Sidebar','Calla/NavGroup']){const s=sidebarPage.children.find(n=>n.type==='COMPONENT_SET'&&n.name===family);const expanded=s.children.find(n=>n.variantProperties.Mode==='Expanded'||n.variantProperties.State==='Expanded');const collapsed=s.children.find(n=>n.variantProperties.Mode==='Collapsed'||n.variantProperties.State==='Collapsed');for(const [a,b]of [[expanded,collapsed],[collapsed,expanded]]){let trigger=a.findOne(n=>n.name==='Workspace header')||a.findOne(n=>n.name==='Disclosure');if(!trigger)trigger=a.children[0];await trigger.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:b.id,navigation:'CHANGE_TO',transition:null}]}]);ids.push(trigger.id);}}
    await figma.setCurrentPageAsync(screen);
    const destinations={'리스트 등록':'13:7697','상품 추가':'13:7739','등록 전 검토':'13:8039','등록하기':'13:8039','실패 항목 확인':'13:8142'};
    for(const f of screen.children.filter(n=>n.type==='FRAME'&&/^0[1-8]/.test(n.name)))for(const b of f.findAll(n=>n.type==='INSTANCE'&&n.name==='Calla/Button')){const text=b.findOne(n=>n.type==='TEXT')?.characters;if(destinations[text]){await b.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:destinations[text],navigation:'OVERLAY',transition:null}]}]);ids.push(b.id);}}
    screen.selection=[await figma.getNodeByIdAsync('13:5873')];figma.viewport.scrollAndZoomIntoView(screen.selection);
    figma.ui.postMessage({status:'완료',changed:ids.length,scrollDialogs:2,foreground:'#FFFFFF',updatedIds:ids.slice(-15)});
  }catch(e){figma.ui.postMessage({status:'error',error:String(e),stack:e.stack});}
}
polish();
