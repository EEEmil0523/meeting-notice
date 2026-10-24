# 開會通知單產生器（新竹高商 綜三1）

填「開會日期 + 第幾次」，按下按鈕就下載一份 `.docx` 開會通知單。
格式不是重新排版，而是直接沿用母檔 `assets/template.docx`（第6次那份），
只把四個欄位換掉，所以標楷體、字級、行距、A4 邊界、編號清單、分頁都跟原檔一致。

替換的欄位：

| 欄位 | 母檔內容 | 產生時 |
| --- | --- | --- |
| 次數 | 第6次（標題、開會事由、議程標題共 3 處） | 第 N 次 |
| 發文日期 | 中華民國115年10月21日 | 選定日期的民國年 |
| 星期 | 星期三 | 由日期自動計算 |
| 開會時間 | 下午13點10分 | 可修改，預設沿用母檔 |
| 發文字號 | 新商學字第1160005號 | 尾數＝次數 − 1（第7次 → 1160006），前綴與位數沿用母檔 |

其餘文字（受文者、聯絡人、速別、附件、議程清單、備註）完全不動。

## 首頁密碼

進入頁面前要先輸入密碼，通過後才會載入母檔（解鎖前不會發出 `assets/template.docx` 請求）。
解鎖狀態存在瀏覽器 `localStorage`，同一台裝置 30 天內不用再輸入；清除網站資料就會重新要求。
密碼只以 SHA-256 存在 `lib/password.js`，原始碼與線上檔案都找不到明碼。

換密碼：

```sh
python -c "import hashlib; print(hashlib.sha256('新密碼'.encode()).hexdigest())"
```

把輸出的雜湊貼到 `PASSWORD_HASH`，重新產生 `dist/` 再部署。注意：已解鎖的裝置會繼續保持解鎖直到 30 天到期或清除瀏覽器資料。

**安全範圍**：這是「防止誤闖」等級，不是真正的存取控制。母檔仍可透過
`/assets/template.docx` 直接下載（實測 200），前端密碼也可被繞過。
要真的保護內容，需要改成 Worker 端驗證＋伺服器端保管母檔。

## 本機執行

這個工具是純靜態頁面，需要透過 HTTP 開啟（`file://` 無法讀取母檔）：

```sh
cd meeting-notice
python -m http.server 5199
# 開啟 http://127.0.0.1:5199/
```

## 測試

```sh
bun test meeting-notice/tests
```

測試會驗證：母檔欄位解析、西元轉民國與星期、替換結果、時間格式錯誤時要報錯，
以及重新打包後的 ZIP 每個檔案都完整。

產生一份樣本檔（放在 `examples/`）：

```sh
bun meeting-notice/scripts/make-sample.mjs 2026-10-28 7 下午13點10分
```

## 換母檔

拿一份新的通知單覆蓋 `assets/template.docx` 即可。程式會自動從母檔讀出
目前的次數、發文日期、星期、時間與發文字號，不需要改程式；若母檔缺少必要欄位，
畫面會直接顯示錯誤，不會產出格式壞掉的檔案。

母檔的 `word/document.xml` 必須是單一 `word/document.xml` 結構（標準 Word/docx 輸出），
且「第6次開會通知單」「發文日期: 中華民國…」「開會時間: …星期…」這三段文字要完整存在。

## 部署

整個 `meeting-notice/` 目錄就是網站（`index.html`、`app.js`、`lib/`、`assets/`），
不需要伺服器端程式：ZIP 解包與重新打包都在瀏覽器完成，檔案不會上傳。
可放到任何靜態網站空間（Cloudflare Pages、GitHub Pages、學校空間都可以）。

已發布於 GitHub（preview 環境，已公開）：
<https://eeemil0523.github.io/meeting-notice/>

更新流程：`rm -rf dist && mkdir dist` 後複製 `index.html`、`style.css`、`app.js`、`lib/`、`assets/` 進 `dist/`，
再以 `deploy.json` 部署（Worker 只有 `deploy/index.js` 的 `env.ASSETS.fetch`）。
