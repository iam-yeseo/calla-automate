import { PREVIEW_CSP } from './preview-csp';
import { Select } from './components/ui/Select';
import { copyText } from './desktop';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Automation, DetailBlock, DetailImage, Product, Settings } from './types';
import { core } from './domain';
import './editor-redesign.css';
import MoneyInput from './MoneyInput';
import OriginInput from './OriginInput';
import { mallBrands, resolveBrand } from './mall-settings';
import { Button, Field, Icon, Modal, ModalCloseButton, Search, Badge } from './ui';
import { FileDropzone, ModalSection, SegmentedTabs } from './interaction';
const EditorNotice=({children,tone='brand'}:{children:ReactNode;tone?:'brand'|'warning'})=><div className={`editor-notice ${tone}`}><img src="/assets/figma-050/067c8.svg" alt=""/>{children}</div>;
type Props={product:Product;settings:Settings;pendingFile?:File;readonly?:boolean;embedded?:boolean;busy?:boolean;applyLabel?:string;onClose:()=>void;onApply:(product:Product,file?:File)=>void|Promise<void>};
function EditorShell({embedded,busy,readonly,title,subtitle,onClose,footer,children}:{embedded:boolean;busy:boolean;readonly:boolean;title:string;subtitle:string;onClose():void;footer:ReactNode;children:ReactNode}){
 if(embedded)return <section className="preview-inline-editor product-editor-modal" aria-label="등록 내용 수정"><div className="preview-inline-editor-heading"><h3>{title}</h3><p>{subtitle}</p></div><fieldset className="preview-inline-editor-fields" disabled={busy}>{children}</fieldset><div className="preview-inline-editor-footer">{footer}</div></section>;
 return <Modal className="product-editor-modal" title={title} subtitle={subtitle} onClose={onClose} dismissible={!busy} confirmClose={!readonly} width={800} footer={footer}>{children}</Modal>;
}
export default function ProductEditor({product,settings,pendingFile,readonly=false,embedded=false,busy=false,applyLabel,onClose,onApply}:Props){
 const tabsId=useId();
 const draftOnly=embedded&&applyLabel==='리스트 초안 저장';
 const [draft,setDraft]=useState(()=>({...structuredClone(product),name_own:core.namePrefix(product.name_own).name,automation:core.normalize(product.automation)}));
 const [prefix,setPrefix]=useState(()=>{const parsed=core.namePrefix(product.name_own);return parsed.enabled?{enabled:true,text:parsed.text}:{enabled:false,text:typeof product.automation.namePrefix?.text==='string'?product.automation.namePrefix.text:''};});
 const [tab,setTab]=useState('basic'),[file,setFile]=useState<File|undefined>(pendingFile),[preview,setPreview]=useState('');
 const [error,setError]=useState(''),[brandPicker,setBrandPicker]=useState(false),[brandMall,setBrandMall]=useState<'retail'|'wholesale'>('retail'),[brandQuery,setBrandQuery]=useState(''),[checking,setChecking]=useState(false),[copied,setCopied]=useState<'thumbnail'|'html'|null>(null);
 const [categoryPicker,setCategoryPicker]=useState<{mall:'retail'|'wholesale';index:number}|null>(null),[categoryCode,setCategoryCode]=useState(''),[categoryQuery,setCategoryQuery]=useState(''),[includeBrand,setIncludeBrand]=useState(true),[showHtmlPreview,setShowHtmlPreview]=useState(false);
 const [thumbnailState,setThumbnailState]=useState<'unchecked'|'valid'|'error'>('unchecked');
 const [applying,setApplying]=useState(false);
 const validationRun=useRef(0),thumbnailValidationRun=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;validationRun.current++;};},[]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>{thumbnailValidationRun.current++;setThumbnailState('unchecked');},[draft.image_url,preview]);
 const set=(key:keyof Product,value:unknown)=>setDraft(p=>({...p,[key]:value}));
 const setAutomation=(patch:Partial<Automation>)=>{validationRun.current++;setChecking(false);setDraft(p=>({...p,automation:{...p.automation,...patch}}));};
 const categorySelections=draft.automation.categorySelections||{retail:[],wholesale:[]};
 const changeCategories=(mall:'retail'|'wholesale',codes:string[])=>setAutomation({categoryCodes:{...draft.automation.categoryCodes,[mall]:codes[0]||''},categorySelections:{...categorySelections,[mall]:codes}});
 const openCategory=(mall:'retail'|'wholesale',index:number)=>{setCategoryPicker({mall,index});setCategoryCode(categorySelections[mall][index]||'');setCategoryQuery('');};
 const blocks=core.detailBlocks(draft.automation);
 const stock=draft.automation.stock||{mode:'unlimited' as const,quantity:0};
 const imageCount=blocks.filter(b=>b.type==='image').length;
 const setBlocks=(next:DetailBlock[])=>setAutomation(core.withDetailBlocks(draft.automation,next));
 const imageChange=(index:number,patch:Partial<DetailImage>)=>setBlocks(blocks.map((block,i)=>i===index&&block.type==='image'?{...block,image:{...block.image,...patch,...(('filename'in patch||'folder'in patch)?{validation:{status:'unchecked' as const}}:{})}}:block));
 const moveBlock=(index:number,offset:number)=>{const next=[...blocks],target=index+offset;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];setBlocks(next);};
 const generator=core.generatorValues(draft);
 const generate=()=>{try{
  const filenameBrand=includeBrand?generator.brand:'image';
  const generated=core.generate({...generator,brand:filenameBrand}).map(image=>({id:crypto.randomUUID(),type:'image' as const,image:{...image,...(!includeBrand?{filename:image.filename.slice(core.slug(filenameBrand).length+1)}:{}),validation:{status:'unchecked' as const}}}));
  let index=0;const next:DetailBlock[]=blocks.flatMap<DetailBlock>(block=>block.type==='text'?[block]:index<generated.length?[generated[index++]]:[]);
  const lastImage=next.reduce((last,block,i)=>block.type==='image'?i:last,-1);
  next.splice(lastImage<0?next.length:lastImage+1,0,...generated.slice(index));if(next.length>100)throw new Error('상세페이지 항목은 최대 100개까지 추가할 수 있습니다.');setBlocks(next);setError('');
 }catch(e){setError((e as Error).message);}};
 async function checkImages(){
  const run=++validationRun.current;setChecking(true);setError('');
  const results=await Promise.all(blocks.map(block=>block.type==='text'?Promise.resolve(block):new Promise<DetailBlock>(resolve=>{
   const img=block.image;
   const url=core.imageUrl(img),image=new Image();let finished=false;
   const finish=(status:'valid'|'error'|'timeout')=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve({...block,image:{...img,validation:{status,url,width:image.naturalWidth,height:image.naturalHeight,checkedAt:new Date().toISOString()}}});};
   const timer=setTimeout(()=>finish('timeout'),15000);image.onload=()=>finish(image.naturalWidth?'valid':'error');image.onerror=()=>finish('error');if(url)image.src=url;else finish('error');
  })));
  if(run===validationRun.current&&alive.current){setDraft(p=>({...p,automation:core.withDetailBlocks(p.automation,results)}));setChecking(false);}
 }
 async function apply(){
  if(busy||applying)return;
  if(prefix.enabled&&!prefix.text.trim()){setError('머리말을 입력하거나 머리말 사용을 해제해 주세요.');setTab('basic');return;}
  if(!draft.name_own.trim()){setError('상품명을 입력해 주세요.');setTab('basic');return;}
  const originError=core.originIssue(draft.automation.origin);if(originError){setError(originError);setTab('basic');return;}
  const stockError=core.stockIssue(draft.automation);if(stockError){setError(stockError);setTab('basic');return;}
  const invalid=draft.automation.detailImages.find(img=>core.imageLinkIssue(img));if(invalid){setError(core.imageLinkIssue(invalid));setTab('images');return;}
  setApplying(true);setError('');
  try{await onApply({...draft,name_own:core.withNamePrefix(draft.name_own,prefix),automation:core.withDetailBlocks(core.normalize({...draft.automation,namePrefix:prefix}),blocks)},file);}
  catch(e){setError((e as Error).message);}
  finally{setApplying(false);}
 }
 const priceField=(label:string,key:'price_retail_regular'|'price_retail'|'price_wholesale'|'price_wholesale_master')=><Field label={label}><MoneyInput value={draft[key]} disabled={readonly} onChange={price=>{setDraft(p=>({...p,[key]:price,...(key==='price_retail'?{price_naver:price}:{})}));setError('');}}/></Field>;
 const visibleCategories=categoryPicker?settings.categories[categoryPicker.mall].filter(category=>category.active!==false&&`${core.path(settings.categories[categoryPicker.mall],category.code)} ${category.code}`.toLocaleLowerCase().includes(categoryQuery.toLocaleLowerCase())):[];
 const visibleBrands=mallBrands(settings,brandMall).filter(brand=>brand.active!==false&&core.brandMatches(brand,brandQuery));
 const productCode=`P-${String(draft.seq).padStart(3,'0')}`;
 const validImages=blocks.filter(block=>block.type==='image'&&core.validation(block.image).status==='valid').length;
 const invalidImages=blocks.filter(block=>block.type==='image'&&['error','timeout'].includes(core.validation(block.image).status)).length;
 const addText=()=>setBlocks([...blocks,{id:crypto.randomUUID(),type:'text',text:''}]);
 const checkThumbnail=()=>{const url=preview||draft.image_url;if(!url)return;const run=++thumbnailValidationRun.current;setThumbnailState('unchecked');const img=new Image();img.onload=()=>{if(alive.current&&run===thumbnailValidationRun.current)setThumbnailState('valid');};img.onerror=()=>{if(alive.current&&run===thumbnailValidationRun.current)setThumbnailState('error');};img.src=url;};
 return <><EditorShell embedded={embedded} readonly={readonly} busy={busy||applying} title={embedded?'등록 내용 수정':readonly?'상품 상세':'상품 편집'} subtitle={embedded?(draftOnly?'연결된 리스트 초안만 저장합니다. 이 작업의 전송 내용은 보존됩니다.':'저장하면 수정한 내용으로 미리보기를 갱신합니다.'):`${productCode} · ${tab==='images'?'이미지 URL과 혼합 상세 블록을 편집합니다.':'리스트 초안 편집 · 고도몰 상품은 아직 변경되지 않습니다.'}`} onClose={onClose} footer={<div className="editor-footer"><p className="editor-save-note">{readonly?'조회 권한으로 열었습니다.':embedded?'상품명과 상세페이지 변경은 소매·도매 초안에 함께 저장됩니다.':'목록에 반영한 뒤 리스트에서 저장하세요'}</p><div className="editor-footer-actions"><span className="muted">{tab==='images'&&invalidImages?'초안 반영 가능 · 등록 전 이미지 오류 수정 필요':'변경사항은 리스트 초안에 반영됩니다.'}</span>{embedded?<Button disabled={busy||applying} onClick={onClose}>수정 취소</Button>:<ModalCloseButton disabled={busy||applying}>{readonly?'닫기':'취소'}</ModalCloseButton>}{!readonly&&<Button variant="primary" disabled={busy||applying} onClick={()=>void apply()}>{busy||applying?'저장 및 미리보기 갱신 중…':applyLabel||(embedded?'저장하고 미리보기 갱신':'목록에 반영')}</Button>}</div></div>}>
  <SegmentedTabs id={tabsId} label="상품 설정" value={tab} onChange={setTab} tabs={[{value:'basic',label:'기본 설정'},{value:'images',label:'이미지 설정'}]}/>
  {error&&<div className="alert error" role="alert">{error}</div>}
  <div className="form-stack tab-panel editor-basic-panel" role="tabpanel" id={`${tabsId}-panel-basic`} aria-labelledby={`${tabsId}-tab-basic`} hidden={tab!=='basic'}>
   <div className="editor-name-prefix"><label className="check-label"><input type="checkbox" checked={prefix.enabled} disabled={readonly} onChange={e=>setPrefix(value=>({...value,enabled:e.target.checked}))}/>머리말 사용</label><input aria-label="상품명 머리말" placeholder="예: [중고상품]" maxLength={80} value={prefix.text} disabled={readonly||!prefix.enabled} onChange={e=>setPrefix(value=>({...value,text:e.target.value}))}/></div>
   <Field label="상품명" hint="머리말은 상품명 앞에 빨간색으로 표시됩니다. 기존의 복잡한 HTML은 원문을 유지합니다."><textarea rows={2} value={draft.name_own} disabled={readonly} onChange={e=>set('name_own',e.target.value)}/></Field>
   <Field label="제조사" hint="비워 두면 브랜드명을 사용합니다."><input value={draft.automation.manufacturer??''} disabled={readonly} placeholder={draft.brand} onChange={e=>setAutomation({manufacturer:e.target.value})}/></Field>
   <div className="form-grid"><Field label="브랜드"><div className="input-action"><input value={draft.brand} disabled={readonly} onChange={e=>setDraft(p=>({...p,brand:e.target.value,automation:{...p.automation,brandCodes:undefined}}))}/><Button disabled={readonly} onClick={()=>setBrandPicker(true)}>선택</Button></div></Field><Field label="모델명"><input value={draft.model} disabled={readonly} onChange={e=>set('model',e.target.value)}/></Field></div>
   <ModalSection title="몰별 분류">
    <div className="form-grid editor-mall-categories">{(['retail','wholesale'] as const).map(channel=>{
     const codes=categorySelections[channel].length?categorySelections[channel]:[''];
     const categoryField=(code:string,index:number)=><Field key={index} label={`${channel==='retail'?'소매':'도매'} ${index===0?'대표 카테고리':`추가 카테고리 ${index}`}`} hint={`코드 ${code||'미지정'}`}><div className="editor-category-row"><button type="button" className="editor-category-button" disabled={readonly} onClick={()=>openCategory(channel,index)}>{core.path(settings.categories[channel],code)||code||'카테고리 선택'}</button>{codes.length>1&&<Button variant="ghost" disabled={readonly} aria-label={`${channel==='retail'?'소매':'도매'} 카테고리 ${index+1} 제거`} onClick={()=>changeCategories(channel,codes.filter((_,i)=>i!==index))}><Icon name="close"/></Button>}</div></Field>;
     return <div className="editor-mall-category-column" key={channel}>{categoryField(codes[0],0)}<Field label={channel==='retail'?'소매 브랜드 코드':'도매 브랜드 코드'}><Select disabled={readonly} value={resolveBrand(draft,settings,channel)} onChange={e=>setAutomation({brandCodes:{...draft.automation.brandCodes,[channel]:e.target.value}})}><option value="">브랜드 코드 없음</option>{mallBrands(settings,channel).map(b=><option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}</Select></Field><Button disabled={readonly||codes.some(code=>!code)} onClick={()=>{changeCategories(channel,[...codes,'']);openCategory(channel,codes.length);}}><Icon name="plus"/>카테고리 추가</Button>{codes.slice(1).map((code,index)=>categoryField(code,index+1))}</div>;
    })}</div>
    <p className="field-hint">첫 번째 항목이 고도몰 대표 카테고리입니다. 추가 카테고리는 중복 없이 지정할 수 있습니다.</p>
   </ModalSection>
   <ModalSection title="가격 · 원">
    <div className="form-grid">{priceField('소매 정가','price_retail_regular')}{priceField('소매 판매가','price_retail')}</div>
    <Field label="도매 정가" hint={draft.automation.wholesaleRegularPrice?.mode==='manual'?'직접 입력한 정가를 도매몰에 적용합니다.':'소매 판매가와 같은 금액을 적용합니다.'}><div className="editor-wholesale-regular"><MoneyInput value={core.wholesaleRegularPrice(draft)} disabled={readonly||draft.automation.wholesaleRegularPrice?.mode!=='manual'} onChange={price=>setAutomation({wholesaleRegularPrice:{mode:'manual',value:price}})}/><label className="check-label"><input type="checkbox" disabled={readonly} checked={draft.automation.wholesaleRegularPrice?.mode==='manual'} onChange={e=>setAutomation({wholesaleRegularPrice:e.target.checked?{mode:'manual',value:core.wholesaleRegularPrice(draft)}:{mode:'retail',value:null}})}/>직접 입력</label></div></Field>
    <div className="form-grid">{priceField('도매 베이직','price_wholesale')}{priceField('도매 마스터','price_wholesale_master')}</div>
    <p className="field-hint">빈 가격은 미지정입니다. 0을 입력하면 0원입니다. 도매 마스터 가격은 API로 전송되지 않습니다.</p>
   </ModalSection>
   <ModalSection title="판매 및 재고">
    <div className="form-grid"><Field label="판매 재고" hint="기본값 · 수량 제한 없이 판매"><Select value={stock.mode} disabled={readonly} onChange={e=>setAutomation({stock:{...stock,mode:e.target.value as 'unlimited'|'limited'}})}><option value="unlimited">무한정 판매</option><option value="limited">재고량에 따름</option></Select></Field><Field label="상품 재고" hint={stock.mode==='unlimited'?'‘재고량에 따름’ 선택 시 입력할 수 있습니다.':'등록할 상품 수량을 입력해 주세요.'}><div className="stock-quantity"><input className="input" type="number" inputMode="numeric" min={0} step={1} value={stock.quantity} disabled={readonly||stock.mode==='unlimited'} onChange={e=>setAutomation({stock:{...stock,quantity:Number(e.target.value)}})}/><span>개</span></div></Field></div>
    <div className="form-grid"><Field label="원산지"><OriginInput value={draft.automation.origin} disabled={readonly} onChange={origin=>setAutomation({origin})}/></Field><Field label="리스트 내 상품 코드"><input value={productCode} readOnly/></Field></div>
    <Field label="참고 링크"><input type="url" value={draft.ref_link} disabled={readonly} onChange={e=>set('ref_link',e.target.value)} placeholder="https://"/></Field>
    <Field label="등록 대상"><div className="inline">{(['retail','wholesale'] as const).map(c=><label className="check-label" key={c}><input type="checkbox" disabled={readonly} checked={draft[`need_${c}`]==='필요'} onChange={e=>set(`need_${c}`,e.target.checked?'필요':'불필요')}/>{c==='retail'?'고도몰 소매':'고도몰 도매'}</label>)}</div></Field>
    <Field label="메모 · 선택"><textarea value={draft.note} rows={2} disabled={readonly} onChange={e=>set('note',e.target.value)}/></Field>
    <EditorNotice>{embedded?(draftOnly?'초안을 저장해도 이미 등록된 고도몰 상품은 변경되거나 다시 등록되지 않습니다.':'저장한 뒤 갱신된 미리보기를 다시 확인해 주세요. 실제 상품 반영은 실행 버튼으로 진행합니다.'):'‘목록에 반영’은 리스트 초안만 변경합니다. 저장과 실제 몰 변경은 별도 단계입니다.'}</EditorNotice>
   </ModalSection>
  </div>
  <div className="form-stack tab-panel editor-images-panel" role="tabpanel" id={`${tabsId}-panel-images`} aria-labelledby={`${tabsId}-tab-images`} hidden={tab!=='images'}>
   <Field label="썸네일 URL" hint={file?"선택한 파일은 리스트 저장 시 업로드됩니다.":undefined}><input type="url" value={draft.image_url} disabled={readonly||!!file} placeholder="https://" onChange={e=>{set('image_url',e.target.value);setThumbnailState('unchecked');setCopied(null);}}/></Field>
   <div className="inline editor-thumbnail-actions">{thumbnailState==='valid'?<Badge state="success">썸네일 확인 완료</Badge>:<Button onClick={checkThumbnail} disabled={!preview&&!draft.image_url}>{thumbnailState==='error'?'썸네일 다시 확인':'썸네일 확인'}</Button>}<Button variant="ghost" disabled={!draft.image_url} onClick={()=>copyText(draft.image_url).then(()=>setCopied('thumbnail')).catch(()=>setError('복사 권한을 확인해 주세요.'))}>{copied==='thumbnail'?'복사 완료':'썸네일 주소 복사'}</Button></div>
   {thumbnailState==='error'&&<p className="field-error">썸네일을 불러오지 못했습니다. 이미지 주소를 확인해 주세요.</p>}
   <details className="editor-upload" open={file?true:undefined}><summary>썸네일 파일 업로드{file?` · ${file.name}`:''}</summary><div className="thumbnail-editor"><div className="thumbnail-preview">{preview||draft.image_url?<img src={preview||draft.image_url} alt="상품 썸네일"/>:<><Icon name="photo"/><span>미리보기</span></>}</div><div className="thumbnail-content">{!readonly&&<FileDropzone title="이미지를 끌어다 놓으세요" description="JPG · PNG · WEBP · GIF / 최대 6MB" accept="image/jpeg,image/png,image/webp,image/gif" file={file} hint="저장 시 업로드" onFile={selected=>{if(!['image/jpeg','image/png','image/webp','image/gif'].includes(selected.type)||selected.size>6*1024*1024){setError('6MB 이하의 JPG, PNG, WEBP, GIF 파일을 선택해 주세요.');return;}setFile(selected);setThumbnailState('unchecked');setError('');}}/>}</div></div></details>
   <ModalSection title="상세 이미지 URL 생성">
    <div className="form-grid"><Field label="이미지 파일용 브랜드"><input disabled={readonly} value={generator.brand} onChange={e=>setAutomation({generator:{...draft.automation.generator,brand:e.target.value,brandManual:true}})}/></Field><Field label="이미지 파일용 모델명"><input disabled={readonly} value={generator.product} onChange={e=>setAutomation({generator:{...draft.automation.generator,product:e.target.value,productManual:true}})}/></Field></div>
    <div className="editor-generator-grid"><Field label="서버 폴더"><Select disabled={readonly} value={generator.folder} onChange={e=>setAutomation({generator:{...draft.automation.generator,folder:e.target.value}})}><option value="">폴더 선택</option>{settings.folders.map(f=><option key={f}>{f}</option>)}</Select></Field><Field label="이미지 수"><input disabled={readonly} type="number" min={1} max={50} value={generator.count} onChange={e=>setAutomation({generator:{...draft.automation.generator,count:Number(e.target.value)}})}/></Field><Field label="확장자"><Select disabled={readonly} value={generator.extension} onChange={e=>setAutomation({generator:{...draft.automation.generator,extension:e.target.value}})}>{core.EXTENSIONS.map(ext=><option key={ext}>{ext}</option>)}</Select></Field></div>
    <div className="inline editor-generator-actions"><label className="check-label"><input type="checkbox" checked={includeBrand} disabled={readonly} onChange={e=>setIncludeBrand(e.target.checked)}/>파일명에 브랜드 포함</label><Button disabled={readonly} onClick={generate}>주소 자동 생성</Button><Button onClick={checkImages} disabled={readonly||checking||!imageCount}>{checking?'확인 중…':'이미지 확인'}</Button></div>
    {!!imageCount&&<EditorNotice tone={invalidImages?'warning':'brand'}>상세 이미지 {imageCount}개 중 {validImages}개 확인{invalidImages?` · ${invalidImages}개 주소 오류`:''}. 상품에 맞는 이미지인지 직접 확인하세요.</EditorNotice>}
   </ModalSection>
   <section className="modal-section" aria-labelledby={`${tabsId}-blocks-title`}>
    <div className="editor-section-toolbar"><h3 id={`${tabsId}-blocks-title`}>상세 블록 · 표시 순서</h3><div className="inline"><Button disabled={readonly||blocks.length>=100} onClick={()=>setBlocks([...blocks,{id:crypto.randomUUID(),type:'image',image:{folder:generator.folder,filename:'',validation:{status:'unchecked'}}}])}>이미지 추가</Button><Button disabled={readonly||blocks.length>=100} onClick={addText}>텍스트 추가</Button><Button disabled={readonly||blocks.length>=100} onClick={addText}>HTML 추가</Button></div></div>
    <p className="field-hint">이미지 {imageCount}개 · 텍스트 {blocks.length-imageCount}개 · 텍스트와 HTML 원문은 그대로 보존됩니다. 위·아래 버튼으로 순서를 바꾸세요.</p>
    {!blocks.length&&<div className="image-list-empty"><Icon name="photo"/><p>아직 추가된 상세페이지 내용이 없습니다.</p><span className="muted">이미지 주소를 생성하거나 텍스트를 추가하세요.</span></div>}
    <div className="filename-list">{blocks.map((block,i)=>{const label=`${i+1}번 ${block.type==='image'?'이미지':'텍스트'}`,validation=block.type==='image'?core.validation(block.image).status:'unchecked';return <div className={`image-entry detail-entry ${['error','timeout'].includes(validation)?'has-error':''}`} key={block.id}>
     <div className="detail-entry-heading"><strong>{i+1} · {block.type==='image'?'이미지':core.hasMarkup(block.text)?'원문 HTML':'텍스트'}</strong>{!readonly&&<div className="inline detail-order-actions"><Button aria-label={`${label} 위로 이동`} disabled={i===0} onClick={()=>moveBlock(i,-1)}>위로</Button><Button aria-label={`${label} 아래로 이동`} disabled={i===blocks.length-1} onClick={()=>moveBlock(i,1)}>아래로</Button><Button variant="ghost" aria-label={`${label} 삭제`} onClick={()=>setBlocks(blocks.filter((_,n)=>n!==i))}>블록 삭제</Button></div>}</div>
     {block.type==='text'?<Field label={`${label} 내용`} hint="입력한 코드와 텍스트를 변환 없이 그대로 등록합니다."><textarea className="detail-code" rows={3} value={block.text} disabled={readonly} spellCheck={false} placeholder="텍스트 또는 HTML 코드를 입력하세요." onChange={e=>setBlocks(blocks.map((b,n)=>n===i?{...block,text:e.target.value}:b))}/></Field>:<>
      <div className="inline"><input aria-label={`${label} 파일명`} disabled={readonly} value={block.image.filename} placeholder="이미지 파일명.jpg" onChange={e=>imageChange(i,{filename:e.target.value})}/><Badge state={validation==='valid'?'success':validation==='unchecked'?'pending':'warning'}>{validation==='valid'?'확인 완료':validation==='unchecked'?'미확인':'확인 필요'}</Badge></div>
      <a className="muted image-address" href={core.imageUrl(block.image)||undefined} target="_blank" rel="noreferrer">{core.imageUrl(block.image)||'주소 형식을 확인해 주세요.'}</a><label className="check-label"><input type="checkbox" disabled={readonly} checked={block.image.linkEnabled===true} onChange={e=>imageChange(i,{linkEnabled:e.target.checked})}/>이미지 클릭 시 링크 연결</label>{block.image.linkEnabled&&<input aria-label={`${label} 바로가기 주소`} type="url" disabled={readonly} placeholder="https://" value={block.image.linkUrl||''} onChange={e=>imageChange(i,{linkUrl:e.target.value})}/>}
     </>}
    </div>;})}</div>
   </section>
   <section className="modal-section" aria-labelledby={`${tabsId}-html-title`}>
    <div className="editor-section-toolbar"><h3 id={`${tabsId}-html-title`}>생성된 HTML · 원문 보기</h3><Button disabled={!blocks.length} onClick={()=>copyText(core.detailHtml(draft.automation)).then(()=>setCopied('html')).catch(()=>setError('복사 권한을 확인해 주세요.'))}>{copied==='html'?'복사 완료':'HTML 복사'}</Button></div>
    <Field label="원문 HTML · 블록 순서가 반영된 출력" hint="원문 텍스트와 HTML은 형식 정리하거나 삭제하지 않습니다. 복사 시 원문을 사용합니다."><textarea className="detail-code" readOnly rows={5} value={core.detailHtml(draft.automation)}/></Field>
    <div className="inline"><Button disabled={!blocks.length} onClick={()=>setShowHtmlPreview(value=>!value)}>{showHtmlPreview?'표시 미리보기 닫기':'표시 미리보기'}</Button><span className="field-hint">미리보기는 HTML 표시 결과이며 원문과 다릅니다.</span></div>
    {showHtmlPreview&&<iframe className="editor-html-preview" title="상세페이지 표시 미리보기" sandbox="" referrerPolicy="no-referrer" srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:14px/1.6 sans-serif;margin:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${core.detailHtml(draft.automation)}</body></html>`}/>}
   </section>
  </div>
 </EditorShell>
 {categoryPicker&&<Modal className="editor-category-modal" title="카테고리 선택" subtitle={`${categoryPicker.mall==='retail'?'소매몰':'도매몰'} · ${categoryPicker.index===0?'대표 카테고리':'추가 카테고리'}`} width={672} onClose={()=>setCategoryPicker(null)} footer={<><span className="muted">내부 리스트 작업</span><ModalCloseButton>취소</ModalCloseButton><Button variant="primary" disabled={!categoryCode||categorySelections[categoryPicker.mall].some((code,index)=>index!==categoryPicker.index&&code===categoryCode)} onClick={()=>{const codes=[...(categorySelections[categoryPicker.mall].length?categorySelections[categoryPicker.mall]:[''])];codes[categoryPicker.index]=categoryCode;changeCategories(categoryPicker.mall,codes);setCategoryPicker(null);}}>선택</Button></>}><Search value={categoryQuery} onChange={setCategoryQuery} placeholder="카테고리 경로 또는 코드 검색"/><div className="editor-category-table-label"><span>카테고리 경로</span><span>몰별 코드</span></div><div className="editor-category-options" role="listbox" aria-label={`${categoryPicker.mall==='retail'?'소매':'도매'} 카테고리`}>{visibleCategories.map(category=>{const duplicate=categorySelections[categoryPicker.mall].some((code,index)=>index!==categoryPicker.index&&code===category.code);return <button type="button" role="option" aria-selected={categoryCode===category.code} disabled={duplicate} className="editor-category-option" key={category.code} onClick={()=>setCategoryCode(category.code)}><span>{core.path(settings.categories[categoryPicker.mall],category.code)}{duplicate?' · 이미 선택됨':''}</span><small>{category.code}</small></button>;})}{!visibleCategories.length&&<p className="editor-brand-empty">검색 결과가 없습니다. 검색어나 몰별 카테고리 목록을 확인해 주세요.</p>}</div><p className="field-hint">{categoryCode?`선택한 코드 · ${categoryCode}`:'카테고리를 선택해 주세요. 기존 몰별 코드는 선택을 확정할 때 변경됩니다.'}</p></Modal>}
 {brandPicker&&<Modal className="editor-brand-modal" title="브랜드 선택" subtitle="고도몰 소매·도매 브랜드를 이름, 별칭 또는 초성으로 검색하세요." width={672} onClose={()=>setBrandPicker(false)} footer={<><span className="muted">내부 리스트 작업</span><ModalCloseButton>취소</ModalCloseButton></>}><div className="segmented" aria-label="브랜드 조회 몰"><button className={brandMall==='retail'?'active':''} onClick={()=>setBrandMall('retail')}>고도몰 소매</button><button className={brandMall==='wholesale'?'active':''} onClick={()=>setBrandMall('wholesale')}>고도몰 도매</button></div><Search value={brandQuery} onChange={setBrandQuery} placeholder="브랜드 검색 · 예: AVMATRIX / ㅇㅂ"/><div className="editor-brand-table-label"><span>브랜드명</span><span>몰별 코드</span></div><div className="brand-list">{visibleBrands.map(b=><button key={b.code||b.name} className={`brand-option ${draft.brand===b.name?'selected':''}`} onClick={()=>{setDraft(p=>({...p,brand:b.name,automation:{...p.automation,brandCodes:{...(p.brand===b.name?p.automation.brandCodes:{}),[brandMall]:b.code}}}));setBrandPicker(false);}}><span>{b.name}</span><small className="muted">{b.code}</small>{draft.brand===b.name&&<Icon name="check"/>}</button>)}{!visibleBrands.length&&<p className="editor-brand-empty">검색 결과가 없습니다. 검색어 또는 몰별 브랜드 목록을 확인해 주세요.</p>}</div><p className="field-hint">몰별 코드를 사용합니다. 새 브랜드는 고도몰에서 추가한 뒤 상품 카테고리에서 업데이트해 주세요.</p></Modal>}</>;
}
