import { setupDiscordAuth } from './discord';

async function authHeaders() {
  const auth = await setupDiscordAuth();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.access_token}`,
    'X-Guild-Id': auth.guildId || 'dm',
  };
}

export async function getLists() {
  const headers = await authHeaders();
  const res = await fetch('/.proxy/api/lists', { headers });
  return res.json();
}

export async function createList(title: string) {
  const headers = await authHeaders();
  const res = await fetch('/.proxy/api/lists', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title }),
  });
  return res.json();
}

export async function deleteList(id: string) {
  const headers = await authHeaders();
  await fetch(`/.proxy/api/lists/${id}`, { method: 'DELETE', headers });
}

export async function addItem(listId: string, content: string) {
  const headers = await authHeaders();
  const res = await fetch('/.proxy/api/items', {
    method: 'POST',
    headers,
    body: JSON.stringify({ listId, content }),
  });
  return res.json();
}

export async function toggleItem(id: string, isDone: boolean) {
  const headers = await authHeaders();
  const res = await fetch(`/.proxy/api/items/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isDone }),
  });
  return res.json();
}

export async function deleteItem(id: string) {
  const headers = await authHeaders();
  await fetch(`/.proxy/api/items/${id}`, { method: 'DELETE', headers });
}
