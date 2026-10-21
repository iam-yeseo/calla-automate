const lineEndings = (text: string) => text.replace(/\r\n/g, '\n');
const escapedString = (text: string) => JSON.stringify(text).slice(1, -1);

/** Compare only the observed one-layer API string encoding, without rewriting HTML. */
export function sameDescription(wanted: string, actual: string): boolean {
  const source = lineEndings(wanted);
  if (source === lineEndings(actual)) return true;
  // Goods_Search can return quotes, backslashes and line breaks as literal
  // escape sequences inside an XML scalar. Generate the expected representation
  // instead of repeatedly unescaping an arbitrary response. Keep every space,
  // tag, attribute, URL and text character significant.
  return actual === escapedString(source)
    || actual === escapedString(source.replace(/\n/g, '\r\n'));
}
