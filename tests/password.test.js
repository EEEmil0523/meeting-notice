import { describe, expect, test } from 'bun:test';
import { checkPassword, isUnlockFresh, sha256Hex, UNLOCK_DAYS } from '../lib/password.js';

describe('sha256Hex', () => {
  test('符合標準測試向量', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('checkPassword', () => {
  test('錯的密碼不會通過', async () => {
    expect(await checkPassword('wrong-password')).toBe(false);
    expect(await checkPassword('')).toBe(false);
    expect(await checkPassword(null)).toBe(false);
  });
});

describe('isUnlockFresh', () => {
  test('剛解鎖可用，超過期限就要重新輸入', () => {
    const now = Date.now();
    expect(isUnlockFresh(String(now), now)).toBe(true);
    const almostExpired = now - (UNLOCK_DAYS * 24 * 60 * 60 * 1000 - 1000);
    expect(isUnlockFresh(String(almostExpired), now)).toBe(true);
    const expired = now - (UNLOCK_DAYS * 24 * 60 * 60 * 1000 + 1000);
    expect(isUnlockFresh(String(expired), now)).toBe(false);
  });

  test('沒有紀錄或格式錯誤時視為未解鎖', () => {
    expect(isUnlockFresh(null)).toBe(false);
    expect(isUnlockFresh('')).toBe(false);
    expect(isUnlockFresh('abc')).toBe(false);
    expect(isUnlockFresh('-5')).toBe(false);
  });
});
