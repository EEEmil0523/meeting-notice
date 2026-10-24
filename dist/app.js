import { buildDocumentXml, makeDocNo, readTemplate, toRocDate } from './lib/notice.js';
import { checkPassword, isUnlockFresh, UNLOCK_KEY } from './lib/password.js';
import { unzip, zip } from './lib/zip.js';

const TEMPLATE_URL = './assets/template.docx';
const TEMPLATE_NAME = '綜三1 上學期 第6次開會通知單 .docx';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const form = document.querySelector('#notice-form');
const dateInput = document.querySelector('#date');
const nthInput = document.querySelector('#nth');
const timeInput = document.querySelector('#time');
const dateHint = document.querySelector('[data-hint="date"]');
const statusLine = document.querySelector('[data-status]');
const button = document.querySelector('[data-generate]');
const previewTitle = document.querySelector('[data-preview="title"]');
const previewReason = document.querySelector('[data-preview="reason"]');
const previewDocNo = document.querySelector('[data-preview="docno"]');
const previewTime = document.querySelector('[data-preview="time"]');
const gateForm = document.querySelector('#gate-form');
const gatePassword = document.querySelector('#gate-password');
const gateError = document.querySelector('[data-gate-error]');

let templatePromise = null;
let templateInfo = null;

function loadTemplate() {
  if (!templatePromise) {
    templatePromise = fetch(TEMPLATE_URL, { cache: 'no-cache' }).then(async (response) => {
      if (!response.ok) throw new Error(`讀不到母檔（HTTP ${response.status}）。`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const files = await unzip(bytes);
      const xml = new TextDecoder().decode(files.get('word/document.xml') ?? new Uint8Array());
      return { files, info: readTemplate(xml) };
    });
    templatePromise.catch(() => {
      templatePromise = null;
    });
  }
  return templatePromise;
}

function nextWednesday(now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (3 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function toIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function setStatus(message, tone) {
  statusLine.textContent = message;
  statusLine.dataset.tone = tone ?? '';
}

function updatePreview() {
  const iso = dateInput.value;
  let target = null;
  try {
    target = iso ? toRocDate(iso) : null;
  } catch {
    target = null;
  }
  const nth = nthInput.value.trim();

  previewTitle.textContent = nth ? `第${nth}次開會通知單` : '第＿次開會通知單';
  previewDocNo.textContent = templateInfo && nth && Number(nth) >= 1
    ? `發文字號: ${makeDocNo(templateInfo, Number(nth))}`
    : '發文字號: ＿＿＿＿＿＿＿';
  previewReason.textContent = target
    ? `開會事由: 班級自治討論第${nth || '＿'}次學生會議`
    : '開會事由: 班級自治討論第＿次學生會議';
  previewTime.textContent = target
    ? `開會時間: ${target.text}${target.weekdayText} ${timeInput.value.trim() || '下午13點10分'}`
    : '開會時間: 中華民國＿年＿月＿日星期＿ ＿＿';

  if (!target) {
    dateHint.textContent = '請選擇開會日期。';
    dateHint.dataset.tone = 'warn';
    return;
  }
  if (target.weekday !== 3) {
    dateHint.textContent = `提醒：${target.text}是${target.weekdayText}，不是星期三。`;
    dateHint.dataset.tone = 'warn';
  } else {
    dateHint.textContent = `${target.text}${target.weekdayText}，符合固定開會日。`;
    dateHint.dataset.tone = 'ok';
  }
}

async function buildDocx({ isoDate, nth, time }) {
  const { files, info } = await loadTemplate();
  const xml = new TextDecoder().decode(files.get('word/document.xml'));
  const result = buildDocumentXml(xml, { isoDate, nth, time });

  const nextFiles = new Map(files);
  nextFiles.set('word/document.xml', new TextEncoder().encode(result.xml));
  if (!nextFiles.has('word/styles.xml') || !nextFiles.has('[Content_Types].xml')) {
    throw new Error('母檔結構不完整，無法輸出。');
  }

  const bytes = await zip(nextFiles);
  const blob = new Blob([bytes], { type: MIME_DOCX });
  return { blob, summary: { ...result.summary, templateNth: info.nth } };
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  setStatus('正在產生檔案…', '');

  try {
    const { blob, summary } = await buildDocx({
      isoDate: dateInput.value,
      nth: Number(nthInput.value),
      time: timeInput.value,
    });
    download(blob, summary.fileName);
    setStatus(`已產生：${summary.fileName}（${Math.round(blob.size / 1024)} KB）`, 'ok');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '產生失敗，請再試一次。', 'error');
  } finally {
    button.disabled = false;
  }
});

for (const input of [dateInput, nthInput, timeInput]) {
  input.addEventListener('input', updatePreview);
}

let started = false;

function unlock() {
  document.documentElement.classList.remove('is-locked');
  if (started) return;
  started = true;
  start();
}

gateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  gateError.textContent = '';
  const submit = gateForm.querySelector('[data-gate-submit]');
  submit.disabled = true;
  try {
    if (!(await checkPassword(gatePassword.value))) {
      gateError.textContent = '密碼不正確，請再試一次。';
      gatePassword.select();
      return;
    }
    try {
      localStorage.setItem(UNLOCK_KEY, String(Date.now()));
    } catch {
      // 無痕模式等無法寫入時，本次仍可正常使用
    }
    gatePassword.value = '';
    unlock();
    dateInput.focus();
  } catch (error) {
    gateError.textContent = error instanceof Error ? error.message : '無法驗證密碼。';
  } finally {
    submit.disabled = false;
  }
});

async function start() {
  dateInput.value = toIso(nextWednesday());
  try {
    const { info } = await loadTemplate();
    templateInfo = info;
    nthInput.value = String(Math.min(info.nth + 1, 99));
    timeInput.value = info.timeText;
    setStatus(`格式來源：${TEMPLATE_NAME}`, '');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '讀不到母檔。', 'error');
  }
  updatePreview();
}

let savedUnlock = null;
try {
  savedUnlock = localStorage.getItem(UNLOCK_KEY);
} catch {
  savedUnlock = null;
}

if (isUnlockFresh(savedUnlock)) {
  unlock();
} else {
  gatePassword.focus();
}
