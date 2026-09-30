async function launch(){
  figma.showUI('<style>body{font:14px system-ui;padding:22px;color:#222}pre{white-space:pre-wrap;font-size:12px}h2{color:#F27490}</style><h2>calla · 상품등록 툴</h2><p id="status">올바른 파일에 디자인 시스템을 구성하고 있습니다.</p><pre id="report"></pre><script>onmessage=e=>{const m=e.data.pluginMessage;document.getElementById("status").textContent=m.status;document.getElementById("report").textContent=JSON.stringify(m.data,null,2)}</script>',{width:480,height:560});
  try{
    const original=await figma.getNodeByIdAsync('4:844');if(!original||original.name!=='calla 2')throw Error('Target file guard: open 칼라몰 상품등록 툴 (2eInZ8qvqO2kI88cxofumv).');
    const ds=await buildFoundations();await Promise.all(PENDING);OUT.steps.push('foundations');
    figma.ui.postMessage({status:'사이드바와 운영 화면을 구성하고 있습니다.',data:{typeStyles:11,icons:Object.keys(ICON).length}});
    OUT.sidebar=await buildSidebar();await Promise.all(PENDING);await buildExtraComponents();OUT.steps.push('sidebar');
    OUT.screens=await buildScreens();OUT.dialogs=await buildDialogs();await Promise.all(PENDING);OUT.steps.push('screens');
    await figma.setCurrentPageAsync(PAGES.screens);
    const fs=PAGES.screens.children.filter(n=>n.type==='FRAME');const targets={'등록 요청 상품':'01 · 등록 요청 상품','자동 상품 등록':'03 · 자동 상품 등록','상품 인덱싱':'05 · 상품 인덱싱','상품 카테고리':'06 · 상품 카테고리','서버 이미지 폴더':'07 · 서버 이미지 폴더','실시간 동기화':'08 · 동기화 설정'};
    let links=0;async function connect(source,dest,kind='NAVIGATE'){if(!source||!dest)return;await source.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:dest.id,navigation:kind,transition:null,resetScrollPosition:true}]}]);links++;}
    for(const f of fs){for(const n of f.findAll(n=>n.type==='INSTANCE'&&n.name.startsWith('Nav / '))){const dest=fs.find(x=>x.name===targets[n.name.slice(6)]);if(dest&&dest.id!==f.id)await connect(n,dest);}
      const buttons=f.findAll(n=>n.type==='INSTANCE'&&n.name==='Calla/Button');for(const b of buttons){const label=b.findOne(n=>n.type==='TEXT')?.characters;const map={'리스트 등록':'09 · 리스트 등록','상품 추가':'10 · 상품 기본 설정','등록 전 검토':'13 · 등록 전 검토','등록하기':'13 · 등록 전 검토','등록 시작':'04 · 등록 진행 및 결과','자세히 보기':'04 · 등록 진행 및 결과','실패 항목 확인':'15 · 일부 등록 완료','채널 연결':'08 · 동기화 설정'};const dest=fs.find(x=>x.name===map[label]);if(dest&&dest.id!==f.id)await connect(b,dest);}
    }
    const requests=fs.find(n=>n.name==='01 · 등록 요청 상품');const detail=fs.find(n=>n.name==='02 · 요청 리스트 상세');await connect(requests.findOne(n=>n.name==='Row 2'),detail);
    const basic=fs.find(n=>n.name==='10 · 상품 기본 설정'),images=fs.find(n=>n.name==='11 · 상품 이미지 설정');await connect(basic.findOne(n=>n.type==='INSTANCE'&&n.name==='Calla/Tab'&&n.findOne(t=>t.type==='TEXT'&&t.characters==='이미지 설정')),images);await connect(images.findOne(n=>n.type==='INSTANCE'&&n.name==='Calla/Tab'&&n.findOne(t=>t.type==='TEXT'&&t.characters==='기본 설정')),basic);
    // Resolve paint fallback values after style application, preserving all bindings.
    for(const p of Object.values(PAGES)){await figma.setCurrentPageAsync(p);for(const n of p.findAll())for(const prop of ['fills','strokes']){if(!(prop in n)||!Array.isArray(n[prop]))continue;let dirty=false;const arr=[];for(const q of n[prop]){const id=q.boundVariables?.color?.id;if(q.type==='SOLID'&&id){const v=await figma.variables.getVariableByIdAsync(id);const value=v?.resolveForConsumer(n).value;if(value&&typeof value.r==='number'){arr.push({...q,color:{r:value.r,g:value.g,b:value.b}});dirty=true;continue;}}arr.push(q);}if(dirty)n[prop]=arr;}}
    Object.values(PAGES).forEach((p,i)=>figma.root.insertChild(i,p));await figma.setCurrentPageAsync(PAGES.screens);PAGES.screens.selection=[requests];figma.viewport.scrollAndZoomIntoView([requests]);
    OUT.status='complete';OUT.links=links;OUT.pages=Object.fromEntries(Object.entries(PAGES).map(([k,v])=>[k,v.id]));OUT.createdNodeIds=IDS;
    figma.ui.postMessage({status:'완료 · 새 파일에 원본 톤으로 정리했습니다.',data:{pages:OUT.pages,screens:OUT.screens,dialogs:OUT.dialogs,links,componentFamilies:Object.keys(COMP).length,icons:Object.keys(ICON).length}});
  }catch(e){figma.ui.postMessage({status:'오류 · 생성된 내용은 보존했습니다.',data:{error:String(e),stack:e.stack,steps:OUT.steps,lastIds:IDS.slice(-20)}});}
}
launch();
