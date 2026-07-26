// ===== المصادقة: تسجيل، دخول، استرجاع كلمة المرور، إعادة تأهيل الحسابات =====

import { API_URL, handle } from './core';

export async function register(
  username: string,
  password: string
): Promise<{ token: string; username: string; isAdmin: boolean; recoveryCode: string }> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handle(res, false);
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handle(res, false);
}

// ===== نسيت كلمة المرور — عن طريق كود الاسترجاع =====

export async function resetWithRecoveryCode(
  username: string,
  recoveryCode: string,
  password: string,
  confirmPassword: string
): Promise<{ message: string; recoveryCode: string }> {
  const res = await fetch(`${API_URL}/api/auth/reset-with-recovery-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, recoveryCode, password, confirmPassword }),
  });
  return handle(res, false);
}

// ===== إعادة تأهيل الحسابات القديمة =====

export async function completeRehabilitation(rehabToken: string, password: string, confirmPassword: string) {
  const res = await fetch(`${API_URL}/api/auth/rehabilitate/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rehabToken, password, confirmPassword }),
  });
  return handle(res, false);
}
