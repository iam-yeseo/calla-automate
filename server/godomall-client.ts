import type { Channel } from '../src/types';
import { productUrl, type GoodsPage, type MallCode, type RemoteGoods } from '../src/godomall-types';
import { canonicalXml, child, children, digest, GodomallError, parseXml, responseData, scalarFields, value, type XmlNode } from './godomall-xml';
import { withRequiredInfo } from './godomall-preservation';

export interface GodomallSecrets {
  GODOMALL_PARTNER_KEY?: string;
  GODOMALL_CALLAMEDIA_API_USER_KEY?: string;
  GODOMALL_CALLAMEDIA1_API_USER_KEY?: string;
}
export interface RateGate { reserve(mall: Channel): Promise<void>; pause(mall: Channel, milliseconds: number): Promise<void> }
export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export function credentials(env: GodomallSecrets, mall: Channel) {
  const partner = env.GODOMALL_PARTNER_KEY?.trim();
  const key = (mall === 'retail' ? env.GODOMALL_CALLAMEDIA_API_USER_KEY : env.GODOMALL_CALLAMEDIA1_API_USER_KEY)?.trim();
  if (!partner || !key) throw new GodomallError(503, `${mall === 'retail' ? '소매몰' : '도매몰'}의 서버 Secret 설정이 필요합니다: ${!partner ? 'GODOMALL_PARTNER_KEY ' : ''}${!key ? mall === 'retail' ? 'GODOMALL_CALLAMEDIA_API_USER_KEY' : 'GODOMALL_CALLAMEDIA1_API_USER_KEY' : ''}`, 'godomall_configuration');
  return { partner_key: partner, key };
}
const endpoints = {
  search: 'goods/Goods_Search.php', insert: 'goods/Goods_Insert.php', update: 'goods/Goods_Update.php', delete: 'goods/Goods_Delete.php',
  categories: 'goods/Category_Search.php', brands: 'goods/Brand_Search.php', codes: 'common/Code_Search.php',
} as const;
export type Endpoint = keyof typeof endpoints;
const readEndpoints = new Set<Endpoint>(['search', 'categories', 'brands', 'codes']);
const transientStatuses = new Set([502, 503, 504, 520, 521, 522, 523, 524, 530]);
const transientCloudflareCodes = new Set(['1001', '1016', '520', '521', '522', '523', '524', '530']);
const readBackoff = [400, 900];
const readBudgetMs = 28000;
async function beforeDeadline<T>(work: Promise<T>, deadline: number, timeout: () => GodomallError): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(timeout()), Math.max(0, deadline - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}
interface UpstreamDiagnostic { cloudflareCode?: string; cloudflareOrigin?: string; rayId?: string; apiCode?: string }
async function httpDiagnostic(response: Response, secrets: string[]): Promise<UpstreamDiagnostic> {
  // Error pages can echo the submitted form. Keep only bounded, validated codes
  // and request identifiers; neither the body nor arbitrary headers leave here.
  const safe = (candidate: string | null | undefined, pattern: RegExp) => candidate && pattern.test(candidate) && !secrets.some(secret => candidate.includes(secret)) ? candidate : undefined;
  const rayId = safe(response.headers.get('cf-ray'), /^[a-f0-9]{16,32}(?:-[A-Z]{3})?$/i);
  const headerCode = safe(response.headers.get('cf-error-type'), /^(?:52[0-6]|530|1\d{3,4})$/);
  const cloudflareOrigin = safe(response.headers.get('cf-error-origin'), /^(?:cloudflare|edge|origin|worker|workers|dns)$/);
  const isCloudflare = Boolean(headerCode || rayId || response.headers.get('server')?.toLowerCase() === 'cloudflare');
  let body = '';
  const reader = response.body?.getReader();
  if (reader) {
    const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 1000);
    try {
      const decoder = new TextDecoder(); let size = 0;
      while (size < 16384) {
        const part = await reader.read(); if (part.done) break;
        const chunk = part.value.subarray(0, 16384 - size); size += chunk.byteLength;
        body += decoder.decode(chunk, { stream: true });
      }
    } catch { /* Diagnostic reads must preserve the original HTTP failure. */ }
    finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  const bodyCode = body.match(/\berror(?:\s+code)?\s*:?\s*(1\d{3,4})\b/i)?.[1]
    || body.match(/\bcf-error-code["']?\s*>\s*(1\d{3,4})\b/i)?.[1];
  const cloudflareCode = headerCode || (isCloudflare ? safe(bodyCode, /^1\d{3,4}$/) : undefined);
  const header = body.match(/<header>\s*([\s\S]*?)<\/header>/i)?.[1];
  const apiCode = safe(header?.match(/<code>\s*(\d{3})\s*<\/code>/i)?.[1], /^(?!000)\d{3}$/);
  return { ...(cloudflareCode && { cloudflareCode }), ...(cloudflareOrigin && { cloudflareOrigin }), ...(rayId && { rayId }), ...(apiCode && { apiCode }) };
}
function transientHttp(status: number, diagnostic: UpstreamDiagnostic) {
  if (diagnostic.apiCode) return false;
  // Cloudflare documents HTTP 409 specifically for DNS error 1001. An
  // application conflict, even one proxied through Cloudflare, is not retried.
  if (status === 409) return diagnostic.cloudflareCode === '1001';
  return transientStatuses.has(status) && (!diagnostic.cloudflareCode || transientCloudflareCodes.has(diagnostic.cloudflareCode));
}
async function boundedXml(response: Response) {
  if (Number(response.headers.get('content-length')) > 8 * 1024 * 1024) { await response.body?.cancel(); throw new GodomallError(502, '고도몰 응답 크기를 초과했습니다.', 'response_too_large', true); }
  const reader = response.body?.getReader(); if (!reader) throw new GodomallError(502, '고도몰 응답이 없습니다.', 'xml_invalid', true);
  const decoder = new TextDecoder('utf-8', { fatal: true }); let size = 0, result = '';
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new GodomallError(502, '고도몰 응답 크기를 초과했습니다.', 'response_too_large', true); } result += decoder.decode(part.value, { stream: true }); }
    return result + decoder.decode();
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
const required = 'goodsNmFl goodsNm goodsDisplayFl goodsDisplayMobileFl goodsSellFl goodsSellMobileFl scmNo cateCd goodsState goodsPermission taxFreeFl stockFl soldOutFl imageStorage restockFl mileageFl goodsDiscountFl payLimitFl optionFl optionTextFl addGoodsFl deliverySno relationFl imgDetailViewFl externalVideoFl detailInfoDelivery detailInfoAS detailInfoRefund detailInfoExchange allCateCd'.split(' ');
export const REQUIRED_FIELDS = required;
export function preservationIssues(node: XmlNode): string[] {
  node = withRequiredInfo(node);
  const fields = scalarFields(node), issues: string[] = [];
  const missing = required.filter(key => !(key in fields) || fields[key] === '');
  if (missing.length) issues.push(`수정 필수정보 누락: ${missing.join(', ')}`);
  for (const [flag, tag, label] of [['optionFl', 'optionData', '옵션'], ['optionTextFl', 'textOptionData', '입력 옵션'], ['addGoodsFl', 'addGoodsData', '추가상품']] as const) {
    if (fields[flag] === 'y' && !children(node, tag).some(n => n.children.length)) issues.push(`${label} 원본이 없어 보존할 수 없습니다.`);
  }
  for (const option of children(node, 'optionData').filter(n => n.children.length)) {
    if (fields.optionFl === 'y' && ['sno', 'optionNo', 'optionValue1', 'optionPrice', 'optionViewFl', 'optionSellFl', 'stockCnt'].some(k => value(option, k) === null)) issues.push('옵션의 고유번호 또는 필수정보가 없습니다.');
    if (value(option, 'optionImage')) issues.push('옵션 이미지 보존은 공식 상품수정 API에서 확인할 수 없습니다.');
  }
  for (const option of children(node, 'textOptionData').filter(n => n.children.length)) if (['sno', 'optionName', 'mustFl'].some(k => value(option, k) === null)) issues.push('입력 옵션의 고유번호 또는 필수정보가 없습니다.');
  // The search specification does not guarantee ex_title/exN. Absence is not proof of emptiness.
  if (!child(node, 'ex_title')) issues.push('상품추가정보(ex_title/exN)는 조회 응답에 없습니다. 고도몰 수정 API는 이 항목을 보내지 않으면 기존 추가정보를 제거합니다.');
  else if (fields.ex_title && fields.ex_title.split('||').some((_, i) => !child(node, `ex${i + 1}`))) issues.push('상품추가정보 내용이 일부 누락되었습니다.');
  if (!child(node, 'goodsMustInfoData')) issues.push('상품필수정보 원본을 변환할 수 없습니다. 수정 시 기존 상품필수정보가 제거될 수 있습니다.');
  for (const add of children(node, 'addGoodsData').filter(n => n.children.length)) if (['title', 'mustFl', 'goodsNoData'].some(k => !child(add, k))) issues.push('추가상품 원본이 불완전합니다.');
  return [...new Set(issues)];
}
const numberOrNull = (text: string | null) => text !== null && text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : null;
function imageUrl(node: XmlNode): string | null {
  for (const key of ['listImageData', 'mainImageData', 'detailImageData']) {
    for (const item of children(node, key)) {
      const candidates = [item.text, ...item.children.map(n => n.text)];
      for (const candidate of candidates) { try { const url = new URL(candidate.trim()); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Unknown image shapes are not invented. */ } }
    }
  }
  return null;
}
export async function normalizeGoods(mall: Channel, node: XmlNode, checkedAt = new Date().toISOString()): Promise<RemoteGoods> {
  const goodsNo = value(node, 'goodsNo');
  if (!goodsNo || !/^\d{1,20}$/.test(goodsNo)) throw new GodomallError(502, '응답 상품번호가 올바르지 않습니다.', 'xml_invalid');
  return { mallId: mall, goodsNo, name: value(node, 'goodsNm'), model: value(node, 'goodsModelNo'), price: numberOrNull(value(node, 'goodsPrice')), stock: numberOrNull(value(node, 'totalStock')), stockMode: value(node, 'stockFl'), soldOut: value(node, 'soldOutFl'), display: value(node, 'goodsDisplayFl'), displayMobile: value(node, 'goodsDisplayMobileFl'), sell: value(node, 'goodsSellFl'), sellMobile: value(node, 'goodsSellMobileFl'), image: imageUrl(node), url: productUrl(mall, goodsNo), fields: scalarFields(node), preservationIssues: preservationIssues(node), checkedAt, fingerprint: await digest(canonicalXml(node)) };
}
export function records(node: XmlNode, field: string): XmlNode[] {
  if (child(node, field)) return [node];
  return node.children.flatMap(n => child(n, field) ? [n] : n.children.filter(c => child(c, field)));
}
export class GodomallClient {
  constructor(private env: GodomallSecrets, readonly mall: Channel, private fetcher: typeof fetch, private gate: RateGate, private wait = sleep) {}
  async call(endpoint: Endpoint, params: Record<string, string> = {}) {
    if (endpoint === 'delete') throw new GodomallError(403, '상품 삭제는 고도몰 관리자에서만 진행할 수 있습니다.', 'deletion_disabled');
    const keys = credentials(this.env, this.mall), mutation = ['insert', 'update', 'delete'].includes(endpoint);
    const readable = readEndpoints.has(endpoint), deadline = Date.now() + readBudgetMs;
    let lastError: GodomallError | undefined;
    const timedOut = () => lastError || new GodomallError(502, '고도몰 조회 대기시간을 초과했습니다.', 'godomall_network');
    for (let attempt = 0; ; attempt++) {
      // Reserve anew for every read retry. Admission failures never cause another
      // upstream request, and a mutation always has exactly one attempt.
      const reservation = this.gate.reserve(this.mall);
      await (readable ? beforeDeadline(reservation, deadline, timedOut) : reservation);
      const remaining = deadline - Date.now();
      if (readable && remaining <= 0) throw timedOut();
      let delay = readBackoff[attempt];
      let networkRetryAllowed = readable;
      try {
        const request = this.fetcher(`https://openhub.godo.co.kr/godomall5/${endpoints[endpoint]}`, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', accept: 'application/xml,text/xml' },
          // Workers supports manual/follow only. Reject 3xx below without forwarding credentials.
          body: new URLSearchParams({ ...params, ...keys }).toString(), signal: AbortSignal.timeout(mutation ? 40000 : Math.max(1, Math.min(20000, remaining))), redirect: 'manual',
        });
        let response: Response;
        try {
          response = await (readable ? beforeDeadline(request, deadline, () => {
            console.warn('godomall_upstream_timeout', { mall: this.mall, endpoint, attempt: attempt + 1, phase: 'headers' });
            return timedOut();
          }) : request);
        } catch (error) {
          // A transport that ignores AbortSignal must not keep the caller open.
          // Dispose any late read response without consuming it or retrying.
          if (readable && error instanceof GodomallError) void request.then(late => late.body?.cancel()).catch(() => {});
          throw error;
        }
        const retryHeader = response.headers.get('retry-after');
        const retrySeconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : retryHeader ? Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000) : 2;
        const retry = Math.max(2, Math.min(Number.isFinite(retrySeconds) ? retrySeconds : 2, 3600));
        const exhausted = response.status === 429 || response.headers.get('ratelimit-available-level')?.toUpperCase() === 'EXHAUSTED';
        const diagnosticWork = !response.ok ? httpDiagnostic(response, Object.values(keys)) : undefined;
        const diagnostic = diagnosticWork ? await (readable ? beforeDeadline(diagnosticWork, deadline, timedOut) : diagnosticWork) : undefined;
        if (diagnostic) console.warn('godomall_upstream_http', { mall: this.mall, endpoint, status: response.status, attempt: attempt + 1, ...diagnostic });
        if (exhausted) {
          networkRetryAllowed = false;
          const pause = this.gate.pause(this.mall, retry * 1000);
          await (readable ? beforeDeadline(pause, deadline, timedOut) : pause);
        }
        if (response.status === 429) throw new GodomallError(429, `고도몰 호출 한도에 도달했습니다. ${retry}초 후 다시 조회해 주세요.`, 'godomall_rate_limited', mutation, retry);
        if (!response.ok) {
          const context = [diagnostic?.cloudflareCode && `CF ${diagnostic.cloudflareCode}`, diagnostic?.apiCode && `API ${diagnostic.apiCode}`, diagnostic?.rayId && `Ray ${diagnostic.rayId}`].filter(Boolean).join(', ');
          const dns = ['1001', '1016'].includes(diagnostic?.cloudflareCode || '');
          const reason = dns ? '고도몰 서버 주소를 확인하지 못했습니다' : '고도몰 통신 오류';
          lastError = new GodomallError(response.status === 403 ? 403 : 502, `${reason} (${response.status}${context ? `; ${context}` : ''}). ${mutation ? '재전송하지 말고 결과를 확인해 주세요.' : '잠시 후 다시 조회해 주세요.'}`, response.status === 403 ? 'godomall_permission' : 'godomall_http', mutation);
          if (!readable || exhausted || !transientHttp(response.status, diagnostic!) || delay === undefined) throw lastError;
          // Honor short Retry-After values; leave longer waits to an explicit
          // later lookup instead of holding the user's request open.
          if (retryHeader && Number.isFinite(retrySeconds)) {
            if (retrySeconds > 5) throw lastError;
            delay = Math.max(delay, retrySeconds * 1000);
          }
        } else {
          const xml = boundedXml(response);
          return responseData(parseXml(await (readable ? beforeDeadline(xml, deadline, timedOut) : xml)));
        }
      } catch (error) {
        if (error instanceof GodomallError) throw error;
        lastError = new GodomallError(502, mutation ? '고도몰 응답이 끊겼거나 제한시간을 초과했습니다. 작업은 다시 전송하지 않습니다. 결과를 확인해 주세요.' : '고도몰 연결이 끊겼거나 제한시간을 초과했습니다.', 'godomall_network', mutation);
        console.warn('godomall_upstream_network', { mall: this.mall, endpoint, attempt: attempt + 1 });
        if (!networkRetryAllowed || delay === undefined) throw lastError;
      }
      if (Date.now() + delay >= deadline) throw lastError;
      await this.wait(delay);
    }
  }
  async search(params: Record<string, string>): Promise<{ page: GoodsPage; nodes: XmlNode[] }> {
    const page = Number(params.page || 1), size = Number(params.size || 50);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new GodomallError(422, '페이지 번호와 조회 개수(1–100)를 확인해 주세요.', 'invalid_pagination');
    const { header, data } = await this.call('search', { ...params, page: String(page), size: String(size) });
    const nodes = children(data, 'goods_data');
    if (data.children.length && !nodes.length) throw new GodomallError(502, '상품 목록의 XML 구조를 확인할 수 없습니다.', 'xml_invalid');
    const checkedAt = new Date().toISOString(), goods = await Promise.all(nodes.map(n => normalizeGoods(this.mall, n, checkedAt)));
    const total = numberOrNull(value(header, 'total')), maxPage = numberOrNull(value(header, 'max_page')), nowPage = numberOrNull(value(header, 'now_page'));
    if (nowPage !== null && nowPage !== page) throw new GodomallError(502, '요청한 페이지와 응답 페이지가 다릅니다.', 'pagination_mismatch');
    return { nodes, page: { goods, total, page, maxPage, hasNext: maxPage !== null ? page < maxPage : goods.length === size, checkedAt } };
  }
  async get(goodsNo: string) {
    const result = await this.search({ goodsNo, size: '100', page: '1' });
    const index = result.page.goods.findIndex(g => g.goodsNo === goodsNo);
    if (index < 0) throw new GodomallError(404, '해당 몰에서 상품을 확인하지 못했습니다. 이것만으로 삭제를 확정하지 않습니다.', 'goods_not_found');
    return { goods: result.page.goods[index], node: result.nodes[index] };
  }
  async codes(kind: string, parent = ''): Promise<MallCode[]> {
    if (!['categories', 'brands', 'delivery', 'scm', 'memberGroup', 'deliveryInfo', 'asInfo', 'refundInfo', 'exchangeInfo'].includes(kind)) throw new GodomallError(422, '지원하지 않는 코드 조회입니다.', 'invalid_code_type');
    if (parent && !/^(?:\d{3}){1,4}$/.test(parent)) throw new GodomallError(422, '상위 분류 코드를 확인해 주세요.', 'invalid_code');
    const taxonomy = kind === 'categories' || kind === 'brands';
    const { data } = await this.call(taxonomy ? kind : 'codes', taxonomy ? parent ? { cateCd: parent } : {} : { code_type: kind });
    const codeField = taxonomy ? 'cateCd' : kind === 'scm' ? 'scmNo' : kind.endsWith('Info') ? 'informCd' : 'sno';
    const nameField = taxonomy ? 'cateNm' : kind === 'scm' ? 'companyNm' : kind === 'memberGroup' ? 'groupNm' : kind === 'delivery' ? 'method' : 'informNm';
    const codes = records(data, codeField).map(n => ({ code: value(n, codeField)!, name: value(n, nameField) || value(n, codeField)!, fields: scalarFields(n) }));
    const hasContent = (node: XmlNode): boolean => Boolean(node.text.trim()) || node.children.some(hasContent);
    if ((!codes.length && hasContent(data)) || codes.some(row => !row.code.trim())) throw new GodomallError(502, '설정 코드의 XML 구조를 확인할 수 없습니다.', 'xml_invalid');
    // Goods_Insert/Update define 1 as the built-in head office. Code_Search may
    // return only external suppliers, including an empty list for these malls.
    // Add it only after a successful code lookup; never hide auth/format errors.
    if (kind === 'scm' && !codes.some(row => row.code === '1')) codes.unshift({ code: '1', name: '본사', fields: { scmNo: '1', companyNm: '본사' } });
    return codes;
  }
  async validateCode(kind: 'categories' | 'brands' | 'delivery' | 'scm', code: string) {
    if (!code) throw new GodomallError(422, `${kind} 코드를 선택해 주세요.`, 'code_required');
    if ((kind === 'categories' || kind === 'brands') && !/^(?:\d{3}){1,4}$/.test(code)) throw new GodomallError(422, '카테고리·브랜드 코드는 3자리 단위 숫자입니다.', 'invalid_code');
    const parent = kind === 'categories' || kind === 'brands' ? code.slice(0, -3) : '';
    const list = await this.codes(kind, parent);
    const matched = list.find(row => row.code === code);
    if (!matched) throw new GodomallError(422, `선택한 몰에서 ${kind} 코드 ${code}를 확인할 수 없습니다.`, 'mall_code_invalid');
    return matched;
  }
}
