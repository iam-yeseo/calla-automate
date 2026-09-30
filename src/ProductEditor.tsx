import { useEffect, useId, useRef, useState } from 'react';
import type { Automation, DetailImage, Product, Settings } from './types';
import { core, parsePrice } from './domain';
import { Button, Field, Icon, Modal, ModalCloseButton, Search, Badge } from './ui';
import { FileDropzone, ModalSection, SegmentedTabs } from './interaction';
type Props={product:Product;settings:Settings;pendingFile?:File;readonly?:boolean;onClose:()=>void;onApply:(product:Product,file?:File)=>void};
export default function ProductEditor({product,settings,pendingFile,readonly=false,onClose,onApply}:Props){
 const tabsId=useId();
 const [draft,setDraft]=useState(()=>structuredClone(product));
 const [tab,setTab]=useState('basic'),[file,setFile]=useState<File|undefined>(pendingFile),[preview,setPreview]=useState('');
 const [error,setError]=useState(''),[brandPicker,setBrandPicker]=useState(false),[brandQuery,setBrandQuery]=useState(''),[checking,setChecking]=useState(false),[copied,setCopied]=useState<'thumbnail'|'html'|null>(null);
 const validationRun=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;validationRun.current++;};},[]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 const set=(key:keyof Product,value:unknown)=>setDraft(p=>({...p,[key]:value}));
 const setAutomation=(patch:Partial<Automation>)=>{validationRun.current++;setChecking(false);setDraft(p=>({...p,automation:{...p.automation,...patch}}));};
 const imageChange=(index:number,patch:Partial<DetailImage>)=>setAutomation({detailImages:draft.automation.detailImages.map((img,i)=>i===index?{...img,...patch,...(('filename'in patch||'folder'in patch)?{validation:{status:'unchecked' as const}}:{})}:img)});
 const generator=core.generatorValues(draft);
 const generate=()=>{try{const images=core.generate(generator).map(img=>({...img,id:crypto.randomUUID(),validation:{status:'unchecked' as const}}));setAutomation({detailImages:images});setError('');}catch(e){setError((e as Error).message);}};
 async function checkImages(){
  const run=++validationRun.current;setChecking(true);setError('');
  const results=await Promise.all(draft.automation.detailImages.map(img=>new Promise<DetailImage>(resolve=>{
   const url=core.imageUrl(img),image=new Image();let finished=false;
   const finish=(status:'valid'|'error'|'timeout')=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve({...img,validation:{status,url,width:image.naturalWidth,height:image.naturalHeight,checkedAt:new Date().toISOString()}});};
   const timer=setTimeout(()=>finish('timeout'),15000);image.onload=()=>finish(image.naturalWidth?'valid':'error');image.onerror=()=>finish('error');if(url)image.src=url;else finish('error');
  })));
  if(run===validationRun.current&&alive.current){setDraft(p=>({...p,automation:{...p.automation,detailImages:results}}));setChecking(false);}
 }
 function apply(){
  if(!draft.name_own.trim()){setError('상품명을 입력해 주세요.');setTab('basic');return;}
  const invalid=draft.automation.detailImages.find(img=>core.imageLinkIssue(img));if(invalid){setError(core.imageLinkIssue(invalid));setTab('images');return;}
  onApply({...draft,automation:{...draft.automation,detailHtml:core.html(draft.automation.detailImages)}},file);
 }
 const priceField=(label:string,key:'price_retail_regular'|'price_retail'|'price_wholesale'|'price_wholesale_master')=><Field label={label}><input inputMode="numeric" value={draft[key]??''} disabled={readonly} onChange={e=>{try{const price=parsePrice(e.target.value);setDraft(p=>({...p,[key]:price,...(key==='price_retail'?{price_naver:price}:{})}));setError('');}catch(err){setError((err as Error).message);}}}/></Field>;
 return <><Modal title={tab==='images'?'상품 이미지 설정':readonly?'상품 상세':'상품 기본 설정'} subtitle={tab==='images'?'썸네일과 상세페이지 이미지 주소를 함께 관리하세요.':'등록에 필요한 정보를 입력하고 목록에 반영하세요.'} onClose={onClose} icon={tab==='images'?'photo':'box'} width={800} footer={<><span className="muted modal-save-note">{readonly?'조회 권한으로 열었습니다.':'목록에 반영 후 상단에서 저장해 주세요.'}</span><ModalCloseButton>{readonly?'닫기':'취소'}</ModalCloseButton>{!readonly&&<Button variant="primary" onClick={apply}>목록에 반영</Button>}</>}>
  <SegmentedTabs id={tabsId} label="상품 설정" value={tab} onChange={setTab} tabs={[{value:'basic',label:'기본 설정',icon:'box'},{value:'images',label:'이미지 설정',icon:'photo'}]}/>
  {error&&<div className="alert error" role="alert">{error}</div>}
  <div className="form-stack tab-panel" role="tabpanel" id={`${tabsId}-panel-basic`} aria-labelledby={`${tabsId}-tab-basic`} hidden={tab!=='basic'}>
   <ModalSection title="상품 정보" description="상품명과 분류를 입력해 주세요." icon="box">
   <Field label="상품명" hint="고도몰용 HTML 태그를 입력할 수 있습니다. 원문 그대로 저장됩니다."><textarea rows={2} value={draft.name_own} disabled={readonly} onChange={e=>set('name_own',e.target.value)}/></Field>
   <div className="form-grid"><Field label="브랜드"><div className="input-action"><input value={draft.brand} disabled={readonly} onChange={e=>set('brand',e.target.value)}/><Button disabled={readonly} onClick={()=>setBrandPicker(true)}>선택</Button></div></Field><Field label="모델명"><input value={draft.model} disabled={readonly} onChange={e=>set('model',e.target.value)}/></Field></div>
   <div className="form-grid">{(['retail','wholesale'] as const).map(channel=><Field key={channel} label={channel==='retail'?'소매 카테고리':'도매 카테고리'}><select value={draft.automation.categoryCodes[channel]} disabled={readonly} onChange={e=>setAutomation({categoryCodes:{...draft.automation.categoryCodes,[channel]:e.target.value}})}><option value="">카테고리 선택</option>{settings.categories[channel].map(c=><option key={c.code} value={c.code} disabled={c.active===false}>{core.path(settings.categories[channel],c.code)} · {c.code}</option>)}</select></Field>)}</div>
   </ModalSection>
   <ModalSection title="판매 가격" description="비어 있는 가격은 미지정으로, 0은 0원으로 저장됩니다." icon="list">
   <div className="form-grid">{priceField('소매 정가','price_retail_regular')}{priceField('소매 판매가','price_retail')}{priceField('도매 베이직','price_wholesale')}{priceField('도매 마스터','price_wholesale_master')}</div>
   </ModalSection>
   <ModalSection title="등록 옵션" description="등록할 쇼핑몰과 추가 정보를 확인해 주세요." icon="settings">
   <div className="form-grid"><Field label="원산지"><input value={draft.automation.origin} disabled={readonly} onChange={e=>setAutomation({origin:e.target.value})}/></Field><Field label="참고 링크"><input type="url" value={draft.ref_link} disabled={readonly} onChange={e=>set('ref_link',e.target.value)} placeholder="https://"/></Field></div>
   <Field label="등록 대상"><div className="inline">{(['retail','wholesale'] as const).map(c=><label className="check-label channel-option" key={c}><input type="checkbox" disabled={readonly} checked={draft[`need_${c}`]==='필요'} onChange={e=>set(`need_${c}`,e.target.checked?'필요':'불필요')}/>{c==='retail'?'고도몰 소매':'고도몰 도매'}</label>)}</div></Field>
   <Field label="비고"><textarea value={draft.note} rows={3} disabled={readonly} onChange={e=>set('note',e.target.value)}/></Field>
   </ModalSection>
  </div>
  <div className="form-stack tab-panel" role="tabpanel" id={`${tabsId}-panel-images`} aria-labelledby={`${tabsId}-tab-images`} hidden={tab!=='images'}>
   <ModalSection title="상품 썸네일" description="상품 목록에 표시할 대표 이미지를 준비해 주세요." icon="photo">
   <div className="thumbnail-editor"><div className="thumbnail-preview">{preview||draft.image_url?<img src={preview||draft.image_url} alt="상품 썸네일"/>:<><Icon name="photo"/><span>미리보기</span></>}</div><div className="thumbnail-content">{!readonly&&<FileDropzone title="이미지를 끌어다 놓으세요" description="JPG · PNG · WEBP · GIF / 최대 6MB" accept="image/jpeg,image/png,image/webp,image/gif" file={file} hint="저장 시 업로드" onFile={selected=>{if(!['image/jpeg','image/png','image/webp','image/gif'].includes(selected.type)||selected.size>6*1024*1024){setError('6MB 이하의 JPG, PNG, WEBP, GIF 파일을 선택해 주세요.');return;}setFile(selected);setError('');}}/>}<Button variant="ghost" disabled={!draft.image_url} onClick={()=>navigator.clipboard.writeText(draft.image_url).then(()=>setCopied('thumbnail')).catch(()=>setError('복사 권한을 확인해 주세요.'))}>{copied==='thumbnail'?'복사 완료':'썸네일 주소 복사'}</Button></div></div>
   </ModalSection>
   <ModalSection title="상세 이미지 주소 생성" description="서버에 올린 이미지의 파일명과 폴더를 기준으로 주소를 만듭니다." icon="list">
   <div className="form-grid"><Field label="이미지 파일용 브랜드"><input disabled={readonly} value={generator.brand} onChange={e=>setAutomation({generator:{...draft.automation.generator,brand:e.target.value,brandManual:true}})}/></Field><Field label="이미지 파일용 모델명"><input disabled={readonly} value={generator.product} onChange={e=>setAutomation({generator:{...draft.automation.generator,product:e.target.value,productManual:true}})}/></Field></div>
   <div className="form-grid"><Field label="서버 폴더"><select disabled={readonly} value={generator.folder} onChange={e=>setAutomation({generator:{...draft.automation.generator,folder:e.target.value}})}><option value="">폴더 선택</option>{settings.folders.map(f=><option key={f}>{f}</option>)}</select></Field><Field label="확장자"><select disabled={readonly} value={generator.extension} onChange={e=>setAutomation({generator:{...draft.automation.generator,extension:e.target.value}})}>{core.EXTENSIONS.map(ext=><option key={ext}>{ext}</option>)}</select></Field><Field label="이미지 분할 수"><input disabled={readonly} type="number" min={1} max={50} value={generator.count} onChange={e=>setAutomation({generator:{...draft.automation.generator,count:Number(e.target.value)}})}/></Field><div className="field action-field"><Button variant="primary" disabled={readonly} onClick={generate}>주소 자동 생성</Button></div></div>
   </ModalSection>
   <ModalSection title="상세페이지 이미지" description="이미지 주소를 확인하고 필요한 경우 바로가기 링크를 연결하세요." icon="photo">
   <div className="section-heading"><strong>상세페이지 이미지 {draft.automation.detailImages.length}개</strong><Button onClick={checkImages} disabled={readonly||checking||!draft.automation.detailImages.length}>{checking?'확인 중…':'이미지 확인'}</Button></div>
   {!draft.automation.detailImages.length&&<div className="image-list-empty"><Icon name="photo"/><p>아직 추가된 상세 이미지가 없습니다.</p><span className="muted">위에서 폴더와 분할 수를 선택해 주소를 생성하세요.</span></div>}
   <div className="filename-list">{draft.automation.detailImages.map((img,i)=><div className="image-entry" key={img.id||i}><div className="inline"><Icon name="photo"/><input aria-label={`${i+1}번 이미지 파일명`} disabled={readonly} value={img.filename} onChange={e=>imageChange(i,{filename:e.target.value})}/><Badge state={core.validation(img).status==='valid'?'success':core.validation(img).status==='unchecked'?'pending':'warning'}>{core.validation(img).status==='valid'?'확인 완료':core.validation(img).status==='unchecked'?'미확인':'확인 필요'}</Badge>{!readonly&&<Button variant="ghost" aria-label={`${i+1}번 이미지 삭제`} onClick={()=>setAutomation({detailImages:draft.automation.detailImages.filter((_,n)=>n!==i)})}><Icon name="close"/></Button>}</div><a className="muted image-address" href={core.imageUrl(img)||undefined} target="_blank" rel="noreferrer">{core.imageUrl(img)||'주소 형식을 확인해 주세요.'}</a><label className="check-label"><input type="checkbox" disabled={readonly} checked={img.linkEnabled===true} onChange={e=>imageChange(i,{linkEnabled:e.target.checked})}/>이미지 클릭 시 링크 연결</label>{img.linkEnabled&&<input aria-label={`${i+1}번 이미지 바로가기 주소`} type="url" disabled={readonly} placeholder="https://" value={img.linkUrl||''} onChange={e=>imageChange(i,{linkUrl:e.target.value})}/>}</div>)}</div>
   </ModalSection>
   <ModalSection title="상세페이지 HTML" icon="list">
   <Field label="생성된 HTML"><textarea readOnly rows={5} value={core.html(draft.automation.detailImages)}/></Field><Button onClick={()=>navigator.clipboard.writeText(core.html(draft.automation.detailImages)).then(()=>setCopied('html')).catch(()=>setError('복사 권한을 확인해 주세요.'))}>{copied==='html'?'복사 완료':'HTML 복사'}</Button>
   </ModalSection>
  </div>
 </Modal>{brandPicker&&<Modal icon="search" title="브랜드 선택" subtitle="브랜드 이름, 별칭 또는 초성으로 검색하세요." width={560} onClose={()=>setBrandPicker(false)}><Search value={brandQuery} onChange={setBrandQuery} placeholder="브랜드 검색 · 예: AVMATRIX / ㅇㅂ"/><div className="brand-list">{settings.brands.filter(b=>b.active!==false&&core.brandMatches(b,brandQuery)).map(b=><button key={b.code||b.name} className="brand-option" onClick={()=>{set('brand',b.name);setBrandPicker(false);}}><span>{b.name}</span><small className="muted">{b.code}</small>{draft.brand===b.name&&<Icon name="check"/>}</button>)}</div></Modal>}</>;
}
