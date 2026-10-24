// 首頁密碼鎖。只存密碼的 SHA-256，不存明碼；詳見 README 的安全說明。
// 換密碼：把新密碼的 SHA-256 貼到 PASSWORD_HASH（檔案裡有大寫/小寫都要一樣）。

export const PASSWORD_HASH = 'cdbf368768710899547bec9fd4055020f54b2de17e81fd9ea5e19a8755b9f142';

export const UNLOCK_KEY = 'notice-unlocked-at';
export const UNLOCK_DAYS = 30;

export async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('這個瀏覽器不支援加密功能，請改用較新的瀏覽器。');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 只比對雜湊，長度不同也直接回 false。 */
export async function checkPassword(input) {
  const hash = await sha256Hex(String(input ?? ''));
  return hash === PASSWORD_HASH;
}

export function isUnlockFresh(value, now = Date.now()) {
  const at = Number(value);
  if (!Number.isFinite(at) || at <= 0) return false;
  return now - at < UNLOCK_DAYS * 24 * 60 * 60 * 1000;
}
