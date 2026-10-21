import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const directory = new URL('../desktop/assets/', import.meta.url);
await mkdir(directory, { recursive: true });
const logo = (await readFile(new URL('../public/assets/figma/requests-fc341.svg', import.meta.url))).toString('base64');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="64" y="64" width="896" height="896" rx="200" fill="#F27490"/><rect x="92" y="92" width="840" height="840" rx="175" fill="#FFFFFF"/><image x="242" y="400" width="540" height="194.15" xlink:href="data:image/svg+xml;base64,${logo}"/></svg>`;
await writeFile(new URL('icon.svg', directory), icon);
const chunks = [];
for (const [type, size] of [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
  const png = new Resvg(icon, { fitTo: { mode: 'width', value: size } }).render().asPng();
  const header = Buffer.alloc(8); header.write(type); header.writeUInt32BE(png.length + 8, 4);
  chunks.push(header, png);
  if (size === 512) await writeFile(new URL('icon.png', directory), png);
}
const header = Buffer.alloc(8); header.write('icns'); header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
await writeFile(new URL('icon.icns', directory), Buffer.concat([header, ...chunks]));
const tray = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path d="M16.8 5.2a8 8 0 1 0 0 11.6l-2.1-2.1a5 5 0 1 1 0-7.4z" fill="black"/><circle cx="17.4" cy="11" r="1.5" fill="black"/></svg>';
for (const [name, size] of [['trayTemplate.png', 22], ['trayTemplate@2x.png', 44]]) await writeFile(new URL(name, directory), new Resvg(tray, { fitTo: { mode: 'width', value: size } }).render().asPng());
console.log('CALLA 앱 아이콘과 메뉴 막대 아이콘 생성 완료');
