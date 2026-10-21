import test from 'node:test';
import assert from 'node:assert/strict';
import responses from './fixtures/godomall-description-response.json' with { type: 'json' };
import { sameDescription } from '../server/godomall-description';
import { mismatches } from '../server/godomall-mapping';
import { setValue, value, xmlNode } from '../server/godomall-xml';
import { apiHarness, API_ITEM, defaultInsertCodes } from './fixtures/godomall';

const encoded = (html: string) => JSON.stringify(html).slice(1, -1);
const html = '<img src="https://example.test/detail.jpg">\n<p style="color:red">한글 &amp; 상세</p>';

test('detail verification accepts exactly the observed API escaping with LF or CRLF, keeping originals intact', () => {
  const expected = { goodsDescription: html, goodsDescriptionMobile: html };
  for (const actual of [html, html.replaceAll('\n', '\r\n'), encoded(html), encoded(html.replaceAll('\n', '\r\n'))]) {
    assert.equal(sameDescription(html, actual), true);
    const node = xmlNode('goods_data', '', [xmlNode('goodsDescription', actual), xmlNode('goodsDescriptionMobile', actual)]);
    assert.deepEqual(mismatches(expected, node), []);
    assert.equal(value(node, 'goodsDescription'), actual);
    assert.equal(expected.goodsDescription, html);
  }
});

test('HTML edits, whitespace edits and extra encoding layers remain mismatches', () => {
  for (const changed of [
    html.replace('detail.jpg', 'other.jpg'),
    html.replace('color:red', 'color:blue'),
    html.replace('상세', '다른 본문'),
    `<div align="center">${html}</div>`,
    ` ${html}`,
    `${html}\n`,
    html.replace('\n', ' '),
    html.replace('&amp;', '&'),
    encoded(encoded(html)),
  ]) {
    assert.equal(sameDescription(html, changed), false, changed);
    assert.equal(sameDescription(html, encoded(changed)), false, changed);
  }
  assert.deepEqual(mismatches({ goodsNm: html }, xmlNode('goods_data', '', [xmlNode('goodsNm', encoded(html))])), ['상품명']);
});

test('literal backslashes and escape-like product text are preserved rather than decoded repeatedly', () => {
  const literal = String.raw`<pre>C:\new\test; literal \r\n and \"quotes\"</pre>`;
  assert.equal(sameDescription(literal, literal), true);
  assert.equal(sameDescription(literal, encoded(literal)), true);
  assert.equal(sameDescription(literal, literal.replace(String.raw`\r\n`, '\r\n')), false);
  assert.equal(sameDescription(literal, encoded(encoded(literal))), false);
});

test('captured retail and wholesale descriptions still flag the real wrapper and leading-space differences', () => {
  for (const response of responses) {
    assert.equal(sameDescription(response.expected, response.actualPc), false, response.mall);
    assert.equal(sameDescription(response.expected, response.actualMobile), false, response.mall);
    assert.ok(response.expected.startsWith('  <img'));
    // Diagnostic only: the mobile body is identical after exactly the two
    // leading spaces are removed. Production verification does not trim them.
    assert.equal(sameDescription(response.expected.slice(2), response.actualMobile), true, response.mall);
    assert.deepEqual(mismatches({ goodsDescription: response.expected, goodsDescriptionMobile: response.expected }, xmlNode('goods_data', '', [
      xmlNode('goodsDescription', response.actualPc), xmlNode('goodsDescriptionMobile', response.actualMobile),
    ])), ['PC 상세설명', '모바일 상세설명']);
  }
});

test('an encoding-only verification retry uses the existing unique marker and never resubmits the product', async () => {
  const h = apiHarness();
  const prepared = await h.request('/godomall/retail/operations/prepare', 'POST', {
    kind: 'insert', itemId: API_ITEM, choices: { ...defaultInsertCodes, brandCd: '001', scmNo: '1' },
  });
  assert.equal(prepared.status, 201);
  const { operation } = await prepared.json() as any;
  h.modes.insert = 'no-identifier';
  const sent = await h.request(`/godomall/retail/operations/${operation.id}/execute`, 'POST', { confirmed: true });
  const result = await sent.json() as any;
  assert.equal(result.operation.state, 'success');
  const remote = h.remote.retail.get(result.operation.goods_no)!;
  for (const field of ['goodsDescription', 'goodsDescriptionMobile']) setValue(remote, field, encoded(value(remote, field)!.replaceAll('\n', '\r\n')));
  Object.assign(h.tables.godomall_operations[0], { state: 'needs_review', goods_no: null, checked_at: null, error_message: 'PC 상세설명, 모바일 상세설명' });
  const verified = await h.request(`/godomall/retail/operations/${operation.id}/verify`, 'POST', {});
  assert.equal(verified.status, 200);
  const current = await verified.json() as any;
  assert.equal(current.operation.state, 'success');
  assert.equal(current.operation.goods_no, result.operation.goods_no);
  assert.equal(h.calls.filter(call => call.endpoint === 'Goods_Insert.php').length, 1);
  assert.equal(h.remote.retail.size, 1);
});
