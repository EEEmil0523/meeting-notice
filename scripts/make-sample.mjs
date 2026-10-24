// 用法：bun meeting-notice/scripts/make-sample.mjs 2026-10-28 7 下午13點10分
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildDocumentXml } from '../lib/notice.js';
import { unzip, zip } from '../lib/zip.js';

const [isoDate = '2026-10-28', nth = '7', time = '下午13點10分'] = process.argv.slice(2);

const templateBytes = new Uint8Array(await readFile(new URL('../assets/template.docx', import.meta.url)));
const files = await unzip(templateBytes);
const { xml, summary } = buildDocumentXml(new TextDecoder().decode(files.get('word/document.xml')), {
  isoDate,
  nth: Number(nth),
  time,
});

files.set('word/document.xml', new TextEncoder().encode(xml));
const output = await zip(files);
const target = new URL(`../examples/${summary.fileName}`, import.meta.url);
await mkdir(new URL('../examples/', import.meta.url), { recursive: true });
await writeFile(target, output);
console.log(`已寫出：${decodeURIComponent(target.pathname)} (${output.length} bytes)`);
