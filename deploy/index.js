// 靜態網站的 Worker：所有請求都交給 ASSETS 處理（含 .docx 母檔）。
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
