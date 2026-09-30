async function refineStates(){
  figma.showUI('<style>body{font:14px system-ui;padding:20px}pre{white-space:pre-wrap}</style><h3>컴포넌트 상태 정리</h3><pre id="r">정리 중…</pre><script>onmessage=e=>document.getElementById("r").textContent=JSON.stringify(e.data.pluginMessage,null,2)</script>',{width:480,height:400});
  try {
    const p=await figma.getNodeByIdAsync('271:1142');await figma.setCurrentPageAsync(p);
    for(const f of (await figma.listAvailableFontsAsync()).filter(f=>f.fontName.family==='Pretendard'))await figma.loadFontAsync(f.fontName);
    const messages={
      Badge:{Pending:['등록 대기'],Running:['등록 중'],Success:['등록 완료'],Failed:['등록 실패'],Warning:['확인 필요'],Review:['정보 검토'],Paused:['일시 중지'],Disconnected:['연결 필요']},
      Toast:{Success:['저장되었습니다'],Error:['저장하지 못했습니다'],Warning:['입력 정보를 확인해 주세요']},
      Progress:{Running:['상품 등록 중','16 / 24','소비자몰 · 17번째 상품을 처리하고 있습니다.'],Paused:['일시 중지','16 / 24','현재 상품을 마친 뒤 중단합니다.'],Complete:['등록 완료','24 / 24','필요한 채널 등록을 모두 마쳤습니다.']},
      EmptyState:{Empty:['등록할 상품이 없습니다','상품을 추가하거나 엑셀 파일을 불러오세요.'],NoResults:['검색 결과가 없습니다','다른 검색어나 필터를 사용해 보세요.'],Error:['목록을 불러오지 못했습니다','연결 상태를 확인한 후 다시 시도해 주세요.']},
      StatCard:{Default:['등록 대기 상품','24','3개 채널 · 저장된 상품 기준'],Accent:['오늘 등록 완료','36','어제보다 12개 더 등록'],Warning:['확인 필요','3','카테고리·이미지를 확인해 주세요']}
    };
    const changed=[];
    const snapshots=[];
    for(const page of figma.root.children.filter(p=>/^(00|01|03|04|05) · /.test(p.name))){
      await figma.setCurrentPageAsync(page);
      for(const i of page.findAllWithCriteria({types:['INSTANCE']})){const mc=await i.getMainComponentAsync();if(mc&&mc.parent&&mc.parent.type==='COMPONENT_SET'&&messages[mc.parent.name.slice(9)])snapshots.push({node:i,texts:i.findAllWithCriteria({types:['TEXT']}).map(t=>t.characters)});}
    }
    await figma.setCurrentPageAsync(p);
    for(const set of p.children.filter(n=>n.type==='COMPONENT_SET')){
      const family=set.name.slice(9),map=messages[family];
      if(map){
        for(const v of set.children)for(const t of v.findAllWithCriteria({types:['TEXT']})){const refs={...t.componentPropertyReferences};delete refs.characters;t.componentPropertyReferences=refs;}
        for(const [key,def]of Object.entries(set.componentPropertyDefinitions))if(def.type==='TEXT')set.deleteComponentProperty(key);
      }
      if(map)for(const v of set.children){const state=v.variantProperties.State||v.variantProperties.Tone;const words=map[state];if(words){const texts=v.findAllWithCriteria({types:['TEXT']});texts.forEach((t,i)=>{if(words[i]!==undefined){t.characters=words[i];changed.push(t.id);}});}}
      if(family==='Button'){
        const labelKey=Object.keys(set.componentPropertyDefinitions).find(k=>k.startsWith('Label#'));if(labelKey)set.editComponentProperty(labelKey,{defaultValue:'버튼'});
        for(const v of set.children)if(v.variantProperties.State==='Loading'){const label=v.findOne(n=>n.type==='TEXT');const refs={...label.componentPropertyReferences};delete refs.characters;label.componentPropertyReferences=refs;label.characters='처리 중…';}
      }
    }
    for(const snap of snapshots){const texts=snap.node.findAllWithCriteria({types:['TEXT']});texts.forEach((t,i)=>{if(snap.texts[i]!==undefined)t.characters=snap.texts[i];});}
    const report=p.children.filter(n=>n.type==='COMPONENT_SET'&&messages[n.name.slice(9)]).map(s=>({name:s.name,variants:s.children.map(v=>({name:v.name,text:v.findAllWithCriteria({types:['TEXT']}).map(t=>t.characters)}))}));
    figma.ui.postMessage({status:'완료',changed:changed.length,report});
  }catch(e){figma.ui.postMessage({status:'error',error:String(e)});}
}
refineStates();
