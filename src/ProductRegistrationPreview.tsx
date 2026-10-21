import { PREVIEW_CSP } from './preview-csp';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { api } from './api';
import { core, money } from './domain';
import { MALLS, type GodomallOperation, type MallCode, type ProductRegistrationPreview as Preview } from './godomall-types';
import { SegmentedTabs } from './interaction';
import { mallBrands } from './mall-settings';
import { operationPreview } from './operation-preview';
import { resolveShippingPolicy } from './registration-delivery';
import PreviewProductName from './PreviewProductName';
import type { Settings } from './types';
import { Button, Icon } from './ui';
import './product-preview.css';

function DetailPage({ html, mobile }: { html: string; mobile: boolean }) {
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>html{background:#fff;color:#222}body{margin:0;padding:24px 16px;box-sizing:border-box;font:14px/1.7 Arial,sans-serif;overflow-wrap:anywhere}img,video,table{max-width:100%;height:auto}img{vertical-align:middle}*{box-sizing:border-box}pre{white-space:pre-wrap}a{color:#ae3155}body>img{display:block;margin-inline:auto}</style></head><body>${html}</body></html>`;
  if (!html.trim()) return <div className="preview-detail-empty"><Icon name="photo" /><p>등록할 상세페이지가 없습니다.</p></div>;
  return <div className={`preview-detail-viewport ${mobile ? 'is-mobile' : ''}`}>
    <iframe title={`등록할 ${mobile ? '모바일' : 'PC'} 상세페이지`} sandbox="" referrerPolicy="no-referrer" srcDoc={document} />
  </div>;
}

function Shipping({ value, name }: { value: Preview['shipping']; name: string | null }) {
  const knownFee = value.fee !== null;
  return <>
    <span className={knownFee ? 'preview-shipping-amount' : 'preview-unconfirmed'}>{knownFee ? `${money(value.fee)}원` : '배송비 금액 확인 필요'}</span>
    {knownFee && value.freeAbove !== null && <span className="preview-shipping-condition"> · {money(value.freeAbove)}원 이상 무료배송</span>}
    <small className="preview-value-note">{name || '배송 설정명 미확인'}{value.code ? ` · 코드 ${value.code}` : ''}</small>
    <small className="preview-value-note">{value.description}</small>
    {value.methods?.length ? <details className="preview-shipping-policy" data-policy-source={value.policySource}>
      <summary>배송 방식·추가요금</summary>
      <ul>{value.methods.map(method => <li key={method.code}><strong>{method.name}</strong><span>{method.fee === null ? '금액 확인 필요' : `${money(method.fee)}원`}</span><small>{method.description}</small></li>)}</ul>
      {value.additionalFeeNote && <p>{value.additionalFeeNote}</p>}
      {value.checkedAt && <p className="preview-shipping-checked">관리자 설정 확인 {value.checkedAt.slice(0, 10).replaceAll('-', '/')}</p>}
      {value.policySource === 'current-policy' && <p>이전 작업의 배송 금액은 현재 확인된 정책을 기준으로 표시합니다.</p>}
      {value.verification && <p>{value.verification}</p>}
    </details> : null}
  </>;
}

export default function ProductRegistrationPreview({ operation, onEdit, editDisabled = false, editLabel = '등록 내용 수정' }: { operation: GodomallOperation; onEdit?(): void; editDisabled?: boolean; editLabel?: string }) {
  const preview = operation.product_preview || operationPreview(operation);
  const [tab, setTab] = useState('pc'), [failedImage, setFailedImage] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null), [shippingName, setShippingName] = useState<string | null>(null);
  const tabsId = useId();
  useEffect(() => { setFailedImage(false); setTab('pc'); }, [operation.id, preview?.thumbnailUrl]);
  useEffect(() => {
    const controller = new AbortController(); setSettings(null); setShippingName(null);
    if (!preview) return;
    // Older operation snapshots retain the codes. Resolve their readable names
    // by the same mall, without borrowing mutable product draft values.
    void api<{ value: Settings }>('/settings', { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setSettings(result.value);
    }).catch(() => {});
    if (!preview.shipping.name && preview.shipping.code) {
      void api<{ codes: MallCode[] }>(`/godomall/${operation.mall_id}/codes?kind=delivery`, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) setShippingName(result.codes.find(row => row.code === preview.shipping.code)?.name || null);
      }).catch(() => {});
    }
    return () => controller.abort();
  }, [operation]);
  if (!preview) return <div className="preview-loading" role="status">등록 상품 미리보기를 불러오고 있습니다…</div>;
  const brand = preview.brand.name || (settings && mallBrands(settings, operation.mall_id).find(row => row.code === preview.brand.code)?.name) || null;
  const categories = settings?.categories[operation.mall_id] || [];
  const currentCategory = categories.find(row => row.code === preview.category.code);
  const resolvedShippingName = preview.shipping.name || shippingName;
  const shipping = preview.shipping.methods?.length ? preview.shipping
    : resolveShippingPolicy(operation.mall_id, preview.shipping.code, resolvedShippingName, preview.price) || preview.shipping;
  const category = preview.category.path.length > 1 ? preview.category.path.join(' > ')
    : currentCategory ? core.path(categories, currentCategory.code) : preview.category.path.join(' > ') || preview.category.name;
  const additionalCategories = (preview.categories || []).filter(row => row.code !== preview.category.code);
  const categoryLabel = (row: NonNullable<Preview['categories']>[number]) => {
    const current = categories.find(category => category.code === row.code);
    return row.path.length > 1 ? row.path.join(' > ') : current ? core.path(categories, current.code) : row.name || row.code;
  };
  const row = (label: string, children: ReactNode) => <div className="preview-fact"><dt>{label}</dt><dd>{children}</dd></div>;
  return <section className="registration-product-preview" aria-label={`${MALLS[operation.mall_id].name} 등록 상품 미리보기`}>
    <div className="preview-eyebrow"><span className="preview-mall">{MALLS[operation.mall_id].name}</span><span>{operation.state === 'prepared' ? '등록할 상품' : '등록 요청 상품'}</span><span className="preview-visibility">PC {preview.display.pc === 'n' ? '숨김' : preview.display.pc === 'y' ? '노출' : '미확인'} · 모바일 {preview.display.mobile === 'n' ? '숨김' : preview.display.mobile === 'y' ? '노출' : '미확인'}</span>{onEdit && <Button className="preview-edit-trigger" disabled={editDisabled} onClick={onEdit}>{editLabel}</Button>}</div>
    <div className="preview-category" aria-label="등록 카테고리">{category || '카테고리명 미확인'}<small>{preview.category.code || '코드 없음'}</small></div>
    <div className="preview-product-hero">
      <div className="preview-thumbnail">
        {preview.thumbnailUrl && !failedImage ? <img src={preview.thumbnailUrl} alt="등록 상품 썸네일" referrerPolicy="no-referrer" onError={() => setFailedImage(true)} />
          : <div className="preview-thumbnail-empty"><Icon name="photo" /><span>{failedImage ? '썸네일을 불러오지 못했습니다.' : '등록할 썸네일이 없습니다.'}</span></div>}
      </div>
      <div className="preview-product-info">
        <p className="preview-brand">{brand || (preview.brand.code ? `브랜드명 미확인 · ${preview.brand.code}` : '브랜드 미지정')}</p>
        <h3 className="preview-product-name"><PreviewProductName name={preview.name || '상품명 없음'} /></h3>
        <div className="preview-price"><span>판매가</span><div>{preview.regularPrice !== null && <span className="preview-regular-price">정가 <s>{money(preview.regularPrice)}원</s></span>}<strong>{preview.price !== null ? `${money(preview.price)}원` : '금액 미확인'}</strong></div></div>
        <dl className="preview-product-facts">
          {row('브랜드', <>{brand || '미지정'}{preview.brand.code && <small className="preview-inline-code">{preview.brand.code}</small>}</>)}
          {row(additionalCategories.length ? '대표 카테고리' : '카테고리', category || preview.category.code || '미지정')}
          {additionalCategories.length > 0 && row('추가 카테고리', <>{additionalCategories.map(category => <div key={category.code}>{categoryLabel(category)}<small className="preview-inline-code">{category.code}</small></div>)}</>)}
          {row('모델명', preview.model || '미지정')}
          {row('제조사', preview.manufacturer || '미지정')}
          {row('원산지', preview.origin || '미지정')}
          {row('배송비', <Shipping value={shipping} name={resolvedShippingName} />)}
        </dl>
        <div className="preview-payload-note"><Icon name="check" /><span>검토한 등록 내용으로 전송합니다.</span></div>
      </div>
    </div>
    <section className="preview-product-detail" aria-label="등록 상세페이지">
      <div className="preview-detail-heading"><div><h3>상세페이지</h3><p>등록할 이미지와 설명을 확인하세요.</p></div><SegmentedTabs id={tabsId} label="상세페이지 보기" value={tab} onChange={setTab} tabs={[{ value: 'pc', label: 'PC 상세페이지' }, { value: 'mobile', label: '모바일 상세페이지' }]} /></div>
      <div role="tabpanel" id={`${tabsId}-panel-${tab}`} aria-labelledby={`${tabsId}-tab-${tab}`} className="preview-detail-panel">
        <DetailPage key={tab} mobile={tab === 'mobile'} html={tab === 'mobile' ? preview.detailHtmlMobile : preview.detailHtml} />
      </div>
    </section>
  </section>;
}
