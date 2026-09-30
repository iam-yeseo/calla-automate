async function finish(){
  figma.showUI('<style>body{font:14px system-ui;padding:20px}pre{font:12px monospace;white-space:pre-wrap}</style><h2>디자인 마무리</h2><pre id="r">컴포넌트와 연결을 정리하고 있습니다.</pre><script>onmessage=e=>document.getElementById("r").textContent=JSON.stringify(e.data.pluginMessage,null,2)</script>',{width:480,height:600});
  try {
    await loadFonts();
    for(const v of await figma.variables.getLocalVariablesAsync())TOK[v.name]=v;
    for(const s of await figma.getLocalTextStylesAsync())if(s.name.startsWith('Automate/'))STY[s.name]=s;
    const pageNames={overview:'00 · Overview',foundations:'01 · Foundations',components:'02 · Components',sidebar:'03 · Sidebar',screens:'04 · Screens',icons:'05 · SF Symbols'};
    for(const [k,v]of Object.entries(pageNames))PAGES[k]=figma.root.children.find(p=>p.name===v);
    for(const p of [PAGES.components,PAGES.sidebar,PAGES.icons]){
      await figma.setCurrentPageAsync(p);
      for(const n of p.children){if((n.type==='COMPONENT_SET'||n.type==='COMPONENT')&&n.name.startsWith('Automate/'))COMP[n.name.slice(9)]=n;if(n.type==='COMPONENT'&&n.name.startsWith('SF/'))ICON[n.name.slice(3)]=n;}
    }
    await figma.setCurrentPageAsync(PAGES.sidebar);
    const duplicateTooltip=await figma.getNodeByIdAsync('271:4639');if(duplicateTooltip)duplicateTooltip.remove();COMP.Tooltip=await figma.getNodeByIdAsync('271:4448');
    if(!COMP.NavGroup){
      const vv=[];
      for(const state of ['Expanded','Collapsed']){
        const c=track(figma.createComponent());PAGES.sidebar.appendChild(c);c.name='State='+state;c.resize(236,40);c.layoutMode='VERTICAL';c.primaryAxisSizingMode='AUTO';c.counterAxisSizingMode='FIXED';c.fills=[];c.itemSpacing=4;
        const h=row(c,'Disclosure',236,10);h.paddingLeft=h.paddingRight=12;h.resize(236,40);h.counterAxisSizingMode='FIXED';icon(h,'link',20);txt(h,'등록 채널',14,'Medium');spacer(h);icon(h,state==='Expanded'?'chevron.down':'chevron.right',12);
        if(state==='Expanded')for(const label of ['고도몰 소매','고도몰 도매','스마트스토어']){const r=row(c,'Nested / '+label,236,10);r.paddingLeft=42;r.resize(236,36);r.counterAxisSizingMode='FIXED';txt(r,label,12,'Regular','text/secondary');}
        vv.push(c);
      }
      const set=track(figma.combineAsVariants(vv,PAGES.sidebar));set.name='Automate/NavGroup';set.description='Nested navigation disclosure. Enter or Space toggles; left border and 42px inset indicate hierarchy.';set.x=180;set.y=2700;set.resize(560,220);vv.forEach((n,i)=>{n.x=20+i*270;n.y=20;});COMP.NavGroup=set;
      for(let i=0;i<2;i++)await vv[i].children[0].setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:vv[1-i].id,navigation:'CHANGE_TO',transition:null}]}]);
    }
    if(!COMP.Tooltip){const t=track(figma.createComponent());PAGES.sidebar.appendChild(t);t.name='Automate/Tooltip';t.resize(96,32);t.layoutMode='HORIZONTAL';t.primaryAxisSizingMode='AUTO';t.counterAxisSizingMode='AUTO';t.paddingLeft=t.paddingRight=12;t.paddingTop=t.paddingBottom=8;t.fills=[paint('text/primary')];t.cornerRadius=8;const l=txt(t,'등록 요청',12,'Medium','#FFFFFF');labelProp(t,l);t.x=800;t.y=2700;t.description='Rail item label on hover and keyboard focus. Delay 300ms, dismiss on Escape; use aria-label in implementation.';COMP.Tooltip=t;}
    await figma.setCurrentPageAsync(PAGES.screens);
    if(!PAGES.screens.children.find(n=>n.name==='11 · Brand management')){
      const b=shell('11 · Brand management','브랜드 관리','표시 이름과 채널별 브랜드 코드를 한곳에서 관리하세요.','브랜드 관리',6);button(b.heading,'브랜드 추가','Primary');
      const search=row(b.body,'Brand search',b.cw,12);const input=inst(search,'Input',{State:'Default'},'브랜드명 또는 별칭 검색');input.resize(480,44);spacer(search);txt(search,'등록된 브랜드 4개',12,'Regular','text/secondary');
      const table=card(b.body,'Brands',b.cw,0);dataTable(table,b.cw,['브랜드','고도몰 소매','고도몰 도매','스마트스토어','매핑 상태'],[332,176,176,232,200],[
        [{title:'AVMATRIX',sub:'별칭: 에이브이매트릭스'},'AVMATRIX','AVMATRIX','연결 후 설정',{badge:'확인 필요',state:'Review'}],
        [{title:'ROXTONE',sub:'별칭: 록스톤'},'ROXTONE','미지정','연결 후 설정',{badge:'정보 누락',state:'Warning'}],
        [{title:'TILTA',sub:'별칭: 틸타'},'TILTA','TILTA','연결 후 설정',{badge:'확인 필요',state:'Review'}],
        [{title:'HOLLYLAND',sub:'별칭: 홀리랜드'},'HOLLYLAND','HOLLYLAND','연결 후 설정',{badge:'확인 필요',state:'Review'}]
      ]);
      const help=card(b.body,'Brand mapping guidance',b.cw,24);txt(help,'등록 실패를 줄이는 브랜드 매핑',16,'Medium');txt(help,'자동 등록에는 각 쇼핑몰의 실제 브랜드 코드가 필요합니다. 표시 이름이나 별칭과 분리해서 저장하고, 등록 전 채널별 매핑을 검토합니다.',14,'Regular','text/secondary',b.cw-48);badge(help,'화면 설계용 예시 데이터','Pending');
    }
    await Promise.all(PENDING);
    await figma.setCurrentPageAsync(PAGES.screens);
    const pd=PAGES.screens.children.find(n=>n.name==='03 · Product list detail');
    for(const t of pd.findAllWithCriteria({types:['TEXT']})){if(t.characters==='12개 상품')t.characters='5개 상품';}
    for(const b of pd.findAll(n=>n.type==='INSTANCE'&&n.name==='Automate/Badge')){const labels=Object.values(b.componentProperties).filter(p=>p.type==='TEXT').map(p=>p.value);if(labels.includes('정보 누락'))b.setProperties({State:'Warning'});}
    const settings=PAGES.screens.children.find(n=>n.name==='06 · Connections and settings');const current=settings.findOne(n=>n.name==='Settings');if(current){current.fills=[paint('brand/soft')];current.cornerRadius=8;current.paddingLeft=8;current.resize(current.width,36);current.counterAxisSizingMode='FIXED';for(const t of current.findAllWithCriteria({types:['TEXT']}))t.fills=[paint('text/brand')];}
    const dashboardBody=PAGES.screens.children.find(n=>n.name==='01 · Dashboard').findOne(n=>n.name==='Page content');dashboardBody.paddingBottom=24;
    const frames=PAGES.screens.children.filter(n=>n.type==='FRAME');
    const targets={'대시보드':'01 · Dashboard','등록 요청':'02 · Registration requests','자동 등록':'04 · Automation running','상품 인덱싱':'05 · Product index','환경 설정':'06 · Connections and settings','브랜드 관리':'11 · Brand management'};
    let links=0;
    for(const frame of frames){
      for(const n of frame.findAll(n=>n.name.startsWith('Nav / ')||n.name==='Settings'||n.name.startsWith('Channel / '))){const label=n.name==='Settings'||n.name.startsWith('Channel / ')?'환경 설정':n.name.slice(6);const dest=frames.find(f=>f.name===targets[label]);if(dest&&dest.id!==frame.id){await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:dest.id,navigation:'NAVIGATE',transition:null,resetScrollPosition:true}]}]);links++;}}
    }
    const dashboard=frames.find(f=>f.name==='01 · Dashboard');const requests=frames.find(f=>f.name==='02 · Registration requests');const detail=frames.find(f=>f.name==='03 · Product list detail');
    for(const [f,dest] of [[dashboard,requests],[requests,detail]]){const heading=f.findOne(n=>n.name==='Page heading');const btn=heading&&heading.findOne(n=>n.type==='INSTANCE'&&n.name==='Automate/Button');if(btn)await btn.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:dest.id,navigation:'NAVIGATE',transition:null,resetScrollPosition:true}]}]);}
    Object.keys(pageNames).forEach((k,i)=>figma.root.insertChild(i,PAGES[k]));
    figma.currentPage.selection=[dashboard];figma.viewport.scrollAndZoomIntoView([dashboard]);
    figma.ui.postMessage({status:'완료',screens:frames.map(n=>({id:n.id,name:n.name})),navigationLinks:links,createdNodeIds:IDS});
  } catch(e){figma.ui.postMessage({status:'error',error:String(e),stack:e.stack,createdNodeIds:IDS});}
}
finish();
