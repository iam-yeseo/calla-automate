import { child, children, value, xmlNode, type XmlNode } from './godomall-xml';

// Some live malls return goodsMustInfo instead of the documented goodsMustInfoData.
// An explicit empty value is different from an absent or unreadable source.
export function withRequiredInfo(node: XmlNode): XmlNode {
  const copy = structuredClone(node);
  if (child(copy, 'goodsMustInfoData')) return copy;
  const source = child(copy, 'goodsMustInfo');
  if (!source) return copy;
  if (source.children.length) {
    if (source.children.every(n => n.name === 'stepData')) {
      copy.children.push(xmlNode('goodsMustInfoData', '', structuredClone(source.children)));
    }
    return copy;
  }
  if (!source.text.trim()) {
    copy.children.push(xmlNode('goodsMustInfoData'));
    return copy;
  }
  try {
    const data: unknown = JSON.parse(source.text);
    const rows: { title: string; content: string }[] = [];
    const read = (entry: unknown): boolean => {
      if (Array.isArray(entry)) return entry.every(read);
      if (!entry || typeof entry !== 'object') return false;
      const record = entry as Record<string, unknown>;
      const title = record.infoTitle ?? record.title, content = record.infoValue ?? record.value;
      if (typeof title === 'string' && typeof content === 'string') {
        rows.push({ title, content }); return true;
      }
      const keys = Object.keys(record);
      return keys.every(k => /^\d+$/.test(k)) && Object.values(record).every(read);
    };
    if (read(data)) copy.children.push(xmlNode('goodsMustInfoData', '', rows.map(row => xmlNode('stepData', '', [xmlNode('infoTitle', row.title), xmlNode('infoValue', row.content)]))));
  } catch { /* Unknown source stays unknown and is surfaced in the review. */ }
  return copy;
}

export function requiredInfoValue(node: XmlNode): string {
  const source = withRequiredInfo(node);
  const groups = children(source, 'goodsMustInfoData');
  if (!groups.length) return JSON.stringify({ unavailable: true, raw: value(node, 'goodsMustInfo') });
  return JSON.stringify(groups.flatMap(group => children(group, 'stepData').map(row => ({ title: value(row, 'infoTitle'), content: value(row, 'infoValue') }))));
}
