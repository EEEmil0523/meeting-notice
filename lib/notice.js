// 通知單內容產生邏輯：讀出母檔裡現有的「第幾次／日期／星期／時間／發文字號」，
// 只把這幾個地方換掉，其餘文字與格式完全不動。

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

const TEMPLATE_PATTERNS = {
  nth: /第(\d+)次開會通知單/,
  date: /發文日期: 中華民國(\d+)年(\d+)月(\d+)日/,
  schedule: /開會時間:[^<]*?(星期[一二三四五六日])\s*((?:上午|下午)\d+點\d+分)/,
  docNo: /發文字號: ([^<]*?)第(\d+)號/,
};

function xmlEscape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 從母檔抓出可替換的欄位；抓不到就明確報錯，不要默默產出錯的檔案。 */
export function readTemplate(xml) {
  const nth = xml.match(TEMPLATE_PATTERNS.nth);
  const date = xml.match(TEMPLATE_PATTERNS.date);
  const schedule = xml.match(TEMPLATE_PATTERNS.schedule);
  const docNo = xml.match(TEMPLATE_PATTERNS.docNo);
  if (!nth) throw new Error('母檔裡找不到「第N次開會通知單」這行標題。');
  if (!date) throw new Error('母檔裡找不到「發文日期: 中華民國…」這個欄位。');
  if (!schedule) throw new Error('母檔裡找不到「開會時間: …星期…」這個欄位。');
  if (!docNo) throw new Error('母檔裡找不到「發文字號: …第…號」這個欄位。');

  const digits = docNo[2];
  const keep = Math.min(4, digits.length);

  return {
    nth: Number(nth[1]),
    dateText: date[0].replace('發文日期: ', ''),
    weekdayText: schedule[1],
    timeText: schedule[2],
    docNo: {
      prefix: docNo[1],
      digitsPrefix: digits.slice(0, digits.length - keep),
      serialWidth: keep,
      text: `${docNo[1]}第${digits}號`,
    },
  };
}

/**
 * 發文字號：母檔第6次是「1160005」，尾數＝次數 − 1，位數與母檔相同。
 * 第7次 → 1160006。
 */
export function makeDocNo(info, nth) {
  const serial = String(Math.max(Number(nth) - 1, 0)).padStart(info.docNo.serialWidth, '0');
  return `${info.docNo.prefix}第${info.docNo.digitsPrefix}${serial}號`;
}

/** 'YYYY-MM-DD' → 民國年月日（民國年 = 西元年 - 1911）。 */
export function toRocDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
  if (!match) throw new Error('請選擇開會日期。');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('日期不正確，請重新選擇。');
  }
  return {
    roc: year - 1911,
    month,
    day,
    weekday: date.getDay(),
    text: `中華民國${year - 1911}年${month}月${day}日`,
    weekdayText: `星期${WEEKDAY_NAMES[date.getDay()]}`,
  };
}

function replaceAll(xml, search, replacement) {
  return xml.split(search).join(replacement);
}

/**
 * 產生新的 word/document.xml。
 * @param {string} xml 母檔的 document.xml
 * @param {{isoDate: string, nth: number, time?: string}} options
 */
export function buildDocumentXml(xml, { isoDate, nth, time }) {
  const template = readTemplate(xml);
  const target = toRocDate(isoDate);

  const meetingNo = Number(nth);
  if (!Number.isInteger(meetingNo) || meetingNo < 1 || meetingNo > 99) {
    throw new Error('「第幾次」請填 1 到 99 的整數。');
  }

  const nextTime = (time ?? '').trim() || template.timeText;
  if (!/^(上午|下午)\d{1,2}點\d{1,2}分$/.test(nextTime)) {
    throw new Error('開會時間請用「下午13點10分」這種寫法。');
  }

  const nextDocNo = makeDocNo(template, meetingNo);

  let output = xml;
  output = replaceAll(output, `第${template.nth}次`, `第${meetingNo}次`);
  output = replaceAll(output, template.dateText, target.text);
  output = replaceAll(output, template.weekdayText, target.weekdayText);
  output = replaceAll(output, template.timeText, xmlEscape(nextTime));
  output = replaceAll(output, template.docNo.text, nextDocNo);

  if (!output.includes(`第${meetingNo}次開會通知單`)) {
    throw new Error('次數沒有替換成功，母檔格式可能被改過。');
  }

  return {
    xml: output,
    summary: {
      nth: meetingNo,
      roc: target.roc,
      dateText: target.text,
      weekdayText: target.weekdayText,
      timeText: nextTime,
      docNo: nextDocNo,
      isWednesday: target.weekday === 3,
      fileName: `綜三1 上學期 第${meetingNo}次開會通知單.docx`,
    },
  };
}
