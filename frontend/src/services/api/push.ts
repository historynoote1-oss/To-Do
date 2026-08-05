// ===== إشعارات الجهاز (Web Push) =====

import { API_URL, authHeaders, handle } from './core';

export async function getVapidPublicKey() {
  const res = await fetch(`${API_URL}/api/push/vapid-public-key`, { headers: authHeaders() });
  return handle(res) as Promise<{ publicKey: string; enabled: boolean }>;
}

export async function subscribePush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const res = await fetch(`${API_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(subscription),
  });
  return handle(res);
}

export async function unsubscribePush(endpoint: string) {
  const res = await fetch(`${API_URL}/api/push/unsubscribe`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ endpoint }),
  });
  return handle(res);
}
