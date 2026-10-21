import { SaxesParser } from 'saxes';

export interface XmlNode { name: string; attributes: Record<string, string>; children: XmlNode[]; text: string }
export class GodomallError extends Error {
  constructor(public status: number, message: string, public code: string, public uncertain = false, public retryAfter = 0) { super(message); }
}
export const xmlNode = (name: string, text = '', children: XmlNode[] = []): XmlNode => ({ name, text, children, attributes: {} });
export function parseXml(source: string): XmlNode {
  if (source.length > 8 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new GodomallError(502, '허용되지 않은 XML 응답입니다.', 'xml_invalid', true);
  let root: XmlNode | undefined;
  const stack: XmlNode[] = [];
  let count = 0;
  const parser = new SaxesParser({ xmlns: false });
  parser.on('opentag', tag => {
    if (++count > 120000 || stack.length > 32) throw Error('XML limit');
    const node: XmlNode = { name: tag.name, attributes: { ...tag.attributes }, children: [], text: '' };
    if (stack.length) stack[stack.length - 1].children.push(node); else root = node;
    stack.push(node);
  });
  parser.on('text', text => { if (stack.length) stack[stack.length - 1].text += text; });
  parser.on('cdata', text => { if (stack.length) stack[stack.length - 1].text += text; });
  parser.on('closetag', () => { stack.pop(); });
  parser.on('error', () => { throw Error('Malformed XML'); });
  try { parser.write(source).close(); if (!root || stack.length) throw Error('Missing root'); }
  catch { throw new GodomallError(502, '고도몰 XML 응답을 읽지 못했습니다. 전송한 작업은 다시 실행하지 말고 결과를 확인해 주세요.', 'xml_invalid', true); }
  return root;
}
export const children = (node: XmlNode, name: string) => node.children.filter(child => child.name.toLowerCase() === name.toLowerCase());
export const child = (node: XmlNode, name: string) => children(node, name)[0];
export const value = (node: XmlNode, name: string): string | null => child(node, name)?.text ?? null;
export function scalarFields(node: XmlNode): Record<string, string> {
  return Object.fromEntries(node.children.filter(n => !n.children.length).map(n => [n.name, n.text]));
}
export function setValue(node: XmlNode, name: string, text: string) {
  node.children = node.children.filter(n => n.name !== name); node.children.push(xmlNode(name, text));
}
export const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export function serializeXml(node: XmlNode): string {
  if (!/^[A-Za-z_][\w.-]*$/.test(node.name)) throw new GodomallError(422, 'XML 항목 이름이 올바르지 않습니다.', 'xml_invalid');
  return `<${node.name}${Object.entries(node.attributes).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('')}>${escapeXml(node.text)}${node.children.map(serializeXml).join('')}</${node.name}>`;
}
export const documentXml = (goods: XmlNode) => `<?xml version="1.0" encoding="UTF-8"?>\n${serializeXml(xmlNode('data', '', [goods]))}`;
export async function digest(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join(''); }
export function canonicalXml(node: XmlNode): string {
  // Ignore transport indentation but preserve every scalar, repeated node and attribute.
  const copy = structuredClone(node);
  const clean = (n: XmlNode) => { if (n.children.length && !n.text.trim()) n.text = ''; n.children.forEach(clean); };
  clean(copy); return serializeXml(copy);
}
export function responseData(root: XmlNode): { header: XmlNode; data: XmlNode; code: string } {
  const header = child(root, 'header'), data = child(root, 'return');
  const code = header && value(header, 'code')?.trim();
  if (root.name !== 'data' || !header || !code || !/^\d{3}$/.test(code)) throw new GodomallError(502, '공식 응답 구조를 확인할 수 없습니다.', 'xml_invalid', true);
  if (code !== '000') {
    // Never echo upstream text: it can include credentials or submitted data.
    if (['999', '998', '997', '994', '993', '992'].includes(code)) throw new GodomallError(502, `고도몰 인증정보 또는 사용기간을 확인해 주세요. (${code})`, 'godomall_auth');
    if (['996', '995', '401', '403', '405'].includes(code)) throw new GodomallError(403, `고도몰 API 권한 또는 허용 IP를 확인해 주세요. (${code})`, 'godomall_permission');
    if (code === '119') throw new GodomallError(404, '고도몰에 해당 상품번호가 없습니다. 이것만으로 삭제 완료를 판단하지 않습니다.', 'goods_not_found');
    const knownValidation = /^(89[6-9]|69[89]|10[1-9]|11[0-8]|12[0-2]|40[467])$/.test(code);
    throw new GodomallError(knownValidation ? 422 : 502, `고도몰이 요청을 처리하지 못했습니다. 필수값과 설정을 확인해 주세요. (${code})`, `godomall_${code}`, !knownValidation);
  }
  if (!data) throw new GodomallError(502, '고도몰 처리 결과가 비어 있습니다.', 'xml_invalid', true);
  return { header, data, code };
}
