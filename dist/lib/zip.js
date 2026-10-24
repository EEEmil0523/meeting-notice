// 最小可用的 ZIP 讀寫工具（只用瀏覽器內建的 deflate API，沒有外部依賴）。
// 用途：把 .docx 解開、替換 word/document.xml、再原樣打包回去，
// 這樣字型、行距、清單編號、分頁都跟母檔完全一致。

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function streamOf(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function inflateRaw(bytes) {
  const stream = streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(bytes) {
  const stream = streamOf(bytes).pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function dosDateTime(date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** 解開 ZIP，回傳 Map<檔名, Uint8Array>（保持原本的項目順序）。 */
export async function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('這不是有效的 ZIP／docx 檔（找不到檔尾目錄）。');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== SIG_CENTRAL) {
      throw new Error('ZIP 中央目錄格式不正確。');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== SIG_LOCAL) {
      throw new Error(`ZIP 項目 ${name} 的標頭格式不正確。`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) files.set(name, raw.slice());
    else if (method === 8) files.set(name, await inflateRaw(raw));
    else throw new Error(`不支援的 ZIP 壓縮方式（${method}）。`);

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** 把 Map<檔名, Uint8Array> 打包成 ZIP（有壓縮、含 CRC32，Word 可直接開）。 */
export async function zip(files) {
  const { time, day } = dosDateTime(new Date());
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(content);
    let method = 8;
    let body = await deflateRaw(content);
    if (body.length >= content.length) {
      method = 0;
      body = content;
    }

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, SIG_LOCAL, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, day, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, body);
    central.push({ nameBytes, crc, method, compressedSize: body.length, size: content.length, offset });
    offset += local.length + body.length;
  }

  const centralChunks = [];
  let centralSize = 0;
  for (const entry of central) {
    const header = new Uint8Array(46 + entry.nameBytes.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, SIG_CENTRAL, true);
    headerView.setUint16(4, 20, true);
    headerView.setUint16(6, 20, true);
    headerView.setUint16(8, 0, true);
    headerView.setUint16(10, entry.method, true);
    headerView.setUint16(12, time, true);
    headerView.setUint16(14, day, true);
    headerView.setUint32(16, entry.crc, true);
    headerView.setUint32(20, entry.compressedSize, true);
    headerView.setUint32(24, entry.size, true);
    headerView.setUint16(28, entry.nameBytes.length, true);
    headerView.setUint32(42, entry.offset, true);
    header.set(entry.nameBytes, 46);
    centralChunks.push(header);
    centralSize += header.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, SIG_EOCD, true);
  endView.setUint16(8, central.length, true);
  endView.setUint16(10, central.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const all = [...chunks, ...centralChunks, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}
