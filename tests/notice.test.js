import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { buildDocumentXml, makeDocNo, readTemplate, toRocDate } from '../lib/notice.js';
import { unzip, zip } from '../lib/zip.js';

const templatePath = new URL('../assets/template.docx', import.meta.url);

async function loadTemplateXml() {
  const bytes = new Uint8Array(await readFile(templatePath));
  const files = await unzip(bytes);
  return { files, xml: new TextDecoder().decode(files.get('word/document.xml')) };
}

describe('readTemplate', () => {
  test('抓出母檔裡的次數、日期、星期、時間', async () => {
    const { xml } = await loadTemplateXml();
    expect(readTemplate(xml)).toEqual({
      nth: 6,
      dateText: '中華民國115年10月21日',
      weekdayText: '星期三',
      timeText: '下午13點10分',
      docNo: {
        prefix: '新商學字',
        digitsPrefix: '116',
        serialWidth: 4,
        text: '新商學字第1160005號',
      },
    });
  });

  test('母檔格式不對時明確報錯', () => {
    expect(() => readTemplate('<w:t>沒有這些欄位</w:t>')).toThrow();
  });
});

describe('toRocDate', () => {
  test('西元轉民國，並算出星期', () => {
    expect(toRocDate('2026-10-28')).toMatchObject({
      roc: 115,
      month: 10,
      day: 28,
      weekday: 3,
      text: '中華民國115年10月28日',
      weekdayText: '星期三',
    });
  });

  test('跨年與非星期三的日期也正確', () => {
    expect(toRocDate('2027-01-06')).toMatchObject({
      roc: 116,
      text: '中華民國116年1月6日',
      weekdayText: '星期三',
    });
    expect(toRocDate('2026-11-05').weekdayText).toBe('星期四');
  });

  test('不存在的日期報錯', () => {
    expect(() => toRocDate('2026-02-30')).toThrow();
    expect(() => toRocDate('')).toThrow();
  });
});

describe('makeDocNo', () => {
  test('尾數＝次數 − 1，位數沿用母檔', async () => {
    const { xml } = await loadTemplateXml();
    const info = readTemplate(xml);
    expect(makeDocNo(info, 1)).toBe('新商學字第1160000號');
    expect(makeDocNo(info, 6)).toBe('新商學字第1160005號');
    expect(makeDocNo(info, 7)).toBe('新商學字第1160006號');
    expect(makeDocNo(info, 10)).toBe('新商學字第1160009號');
  });
});

describe('buildDocumentXml', () => {
  test('只換掉次數、日期、星期、時間', async () => {
    const { xml } = await loadTemplateXml();
    const { xml: next, summary } = buildDocumentXml(xml, {
      isoDate: '2026-10-28',
      nth: 7,
      time: '下午13點10分',
    });

    expect(next).not.toContain('第6次');
    expect(next).not.toContain('115年10月21日');
    expect(next.split('第7次').length - 1).toBe(3);
    expect(next).toContain('第7次開會通知單');
    expect(next).toContain('開會事由: 班級自治討論第7次學生會議');
    // 議程標題被拆成多個 run（「 / 標題 / 」議程），所以要攤平標籤後再看文字
    expect(next.replace(/<[^>]+>/g, '')).toContain('「班級自治討論第7次學生會議」議程');
    expect(next.split('中華民國115年10月28日').length - 1).toBe(2);
    expect(next).toContain('中華民國115年10月28日星期三 下午13點10分');
    expect(next).toContain('發文字號: 新商學字第1160006號');
    expect(next).not.toContain('1160005');
    expect(summary).toMatchObject({
      docNo: '新商學字第1160006號',
      isWednesday: true,
      fileName: '綜三1 上學期 第7次開會通知單.docx',
    });
  });

  test('次數跟母檔相同時也要正常產出', async () => {
    const { xml } = await loadTemplateXml();
    const { xml: next, summary } = buildDocumentXml(xml, {
      isoDate: '2026-10-21',
      nth: 6,
      time: '下午13點10分',
    });
    expect(next).toContain('第6次開會通知單');
    expect(next).toContain('新商學字第1160005號');
    expect(summary.fileName).toBe('綜三1 上學期 第6次開會通知單.docx');
    expect(summary.isWednesday).toBe(true);
  });

  test('時間可以換成別的寫法', async () => {
    const { xml } = await loadTemplateXml();
    const { xml: next } = buildDocumentXml(xml, {
      isoDate: '2026-11-04',
      nth: 8,
      time: '上午8點30分',
    });
    expect(next).toContain('上午8點30分');
    expect(next).not.toContain('下午13點10分');
    expect(next).toContain('新商學字第1160007號');
  });

  test('時間格式不對時報錯，而不是產出壞檔', async () => {
    const { xml } = await loadTemplateXml();
    expect(() => buildDocumentXml(xml, { isoDate: '2026-11-04', nth: 8, time: '8:30' })).toThrow();
    expect(() => buildDocumentXml(xml, { isoDate: '2026-11-04', nth: 0, time: '上午8點30分' })).toThrow();
  });
});

describe('zip', () => {
  test('重新打包後每個檔案都完好，document.xml 是新內容', async () => {
    const { files, xml } = await loadTemplateXml();
    const { xml: next } = buildDocumentXml(xml, {
      isoDate: '2026-11-04',
      nth: 9,
      time: '下午13點10分',
    });

    const rebuilt = new Map(files);
    rebuilt.set('word/document.xml', new TextEncoder().encode(next));
    const bytes = await zip(rebuilt);
    const roundTrip = await unzip(bytes);

    expect([...roundTrip.keys()]).toEqual([...files.keys()]);
    for (const [name, original] of files) {
      const copy = roundTrip.get(name);
      if (name === 'word/document.xml') {
        expect(new TextDecoder().decode(copy)).toBe(next);
      } else {
        expect(copy).toEqual(original);
      }
    }
    expect(new TextDecoder().decode(roundTrip.get('[Content_Types].xml'))).toContain('wordprocessingml');
  });
});
