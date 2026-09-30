async function resolvePaints(){
  figma.showUI('<style>body{font:14px system-ui;padding:20px}</style><h3>최종 디자인 검수</h3><pre id="r">색상 표시값을 정리하고 있습니다.</pre><script>onmessage=e=>document.getElementById("r").textContent=JSON.stringify(e.data.pluginMessage,null,2)</script>',{width:440,height:260});
  try{
    const fonts=await figma.listAvailableFontsAsync();for(const f of fonts.filter(f=>f.fontName.family==='Pretendard'))await figma.loadFontAsync(f.fontName);
    let changed=0;const affected=[];
    for(const p of figma.root.children.filter(p=>/^(00|01|02|03|04|05) · /.test(p.name))){
      await figma.setCurrentPageAsync(p);
      for(const n of p.findAll())for(const prop of ['fills','strokes']){
        if(!(prop in n)||!Array.isArray(n[prop]))continue;let dirty=false;
        const arr=[];for(const paint of n[prop]){const id=paint.boundVariables&&paint.boundVariables.color&&paint.boundVariables.color.id;if(paint.type!=='SOLID'||!id){arr.push(paint);continue;}const v=await figma.variables.getVariableByIdAsync(id);if(!v){arr.push(paint);continue;}const result=v.resolveForConsumer(n).value;if(!result||typeof result.r!=='number'){arr.push(paint);continue;}const c=paint.color;if(Math.abs(c.r-result.r)+Math.abs(c.g-result.g)+Math.abs(c.b-result.b)>.0001){dirty=true;arr.push({...paint,color:{r:result.r,g:result.g,b:result.b}});}else arr.push(paint);}
        if(dirty){n[prop]=arr;changed++;affected.push(n.id);}
      }
    }
    const p=figma.root.children.find(p=>p.name==='04 · Screens');await figma.setCurrentPageAsync(p);const dash=p.children.find(n=>n.name==='01 · Dashboard');p.selection=[dash];figma.viewport.scrollAndZoomIntoView([dash]);
    figma.ui.postMessage({status:'완료',correctedPaints:changed,notes:'편집 가능한 토큰 연결을 유지하며 미리보기 표시값을 맞췄습니다.'});
  }catch(e){figma.ui.postMessage({status:'error',error:String(e)});}
}
resolvePaints();
