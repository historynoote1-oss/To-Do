const API_URL = import.meta.env.VITE_API_URL as string;

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

async function handle(res: Response) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `خطأ (${res.status})`);
  }
  return res.json();
}

export async function register(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handle(res);
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handle(res);
}

export async function getLists() {
  const res = await fetch(`${API_URL}/api/lists`, { headers: authHeaders() });
  return handle(res);
}

export async function createList(title: string) {
  const res = await fetch(`${API_URL}/api/lists`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  return handle(res);
}

export async function deleteList(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function addItem(listId: string, content: string) {
  const res = await fetch(`${API_URL}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ listId, content }),
  });
  return handle(res);
}

export async function toggleItem(id: string, isDone: boolean) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ isDone }),
  });
  return handle(res);
}

export async function deleteItem(id: string) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}
