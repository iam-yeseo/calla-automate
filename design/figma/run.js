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
