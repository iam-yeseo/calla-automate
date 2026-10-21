import { createElement, useMemo, type CSSProperties, type ReactNode } from 'react';

const omitted = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT']);
const inlineTags: Record<string, string> = { B: 'b', STRONG: 'strong', I: 'i', EM: 'em', U: 'u', S: 's', DEL: 's', SUP: 'sup', SUB: 'sub' };
function safeColor(value: string): string | undefined {
  const color = value.trim();
  if (color.length > 60 || !/^(?:#[0-9a-f]{3,8}|[a-z]{1,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(color)) return;
  return CSS.supports('color', color) ? color : undefined;
}

/** Godomall displays inline name formatting while the API retains its raw
 * source. Build React nodes from a small text-only allowlist; never inject it. */
export default function PreviewProductName({ name }: { name: string }) {
  const children = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = name;
    const render = (nodes: NodeListOf<ChildNode>, parentKey: string): ReactNode[] => Array.from(nodes).map((node, index) => {
      const key = `${parentKey}-${index}`;
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (!(node instanceof HTMLElement) || omitted.has(node.tagName)) return null;
      if (node.tagName === 'BR') return createElement('br', { key });
      const content = render(node.childNodes, key);
      const inline = inlineTags[node.tagName];
      if (inline) return createElement(inline, { key }, content);
      if (node.tagName === 'FONT' || node.tagName === 'SPAN') {
        const color = safeColor(node.getAttribute('color') || node.style.color || '');
        const weight = /^(?:[1-9]00|bold|normal)$/.test(node.style.fontWeight) ? node.style.fontWeight : undefined;
        const style: CSSProperties = { ...(color && { color }), ...(weight && { fontWeight: weight }) };
        return createElement('span', { key, style }, content);
      }
      return createElement('span', { key }, content);
    });
    return render(template.content.childNodes, 'name');
  }, [name]);
  return <>{children}</>;
}
