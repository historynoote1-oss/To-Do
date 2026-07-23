import { LifeAreaData } from './lifeArea';

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

// من غير Content-Type عن قصد: لما بنبعت FormData (رفع صورة الأفتار)، لازم
// المتصفح هو اللي يحدد الـ Content-Type بنفسه (multipart/form-data مع
// boundary)، فلو ثبّتناه يدوي هنا هيبوّظ الطلب.
function authHeadersNoContentType() {
  return {
    Authorization: `Bearer ${getToken()}`,
  };
}

// خطأ مخصوص لوضع الصيانة عشان الواجهة تقدر تفرّق بينه وبين أي خطأ عادي
// وتحوّل المستخدم لصفحة الصيانة فورًا بدل ما تعرضله toast عادي بس.
export class MaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaintenanceError';
  }
}

// بيرجّع تاريخ اليوم الحالي بتوقيت الجهاز نفسه (مش UTC) كنص "YYYY-MM-DD".
// السيرفر (لوحده) مش عارف يحدد "دلوقتي إيه اليوم" بالنسبة للمستخدم لأنه
// بيشتغل بتوقيت UTC، فأي مستخدم بتوقيت متقدّم عن UTC (زي توقيت القاهرة)
// وبيخلّص مهامه بعد نص الليل المحلي بس قبل نص الليل UTC كان بيتسجّل إنجازه
// على يوم غلط ويكسر السلسلة (الاستريك). بنبعت التاريخ المحلي ده صراحةً مع
// كل طلب بيأثر على الاستريك (تأكيد إنجاز، وجلب السلسلة) عشان السيرفر يعتمد
// على يوم المستخدم الفعلي مش يومه هو.
function localDateKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// خطأ مخصوص لانتهاء/بطلان الجلسة (توكن منتهي، حساب اتعمله force-logout،
// كلمة السر اتغيّرت من جهاز تاني...) عشان الواجهة تقدر تفرّق بينه وبين أي
// خطأ عادي وترجّع المستخدم لصفحة تسجيل الدخول فورًا بدل ما تسيبه واقف
// قدام شاشة معطوبة بتكرر له رسائل خطأ "401" مبهمة على كل حركة.
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

// بنمنع إطلاق أكتر من إشعار "الجلسة انتهت" مرة واحدة لو أكتر من طلب اتنفذ
// في نفس اللحظة وكلهم رجعوا 401 (زي refresh() وrefreshArchiveCount() اللي
// بيتنفذوا مع بعض) — من غير الحارس ده هيظهر toast مكرر لكل طلب فشل.
let sessionExpiredNotified = false;

// بتتنادى لما المستخدم يسجّل دخول تاني بنجاح، عشان لو الجلسة الجديدة كمان
// انتهت لاحقًا نقدر نطلق الإشعار تاني بدل ما يفضل الحارس مقفول للأبد.
export function resetSessionExpiredGuard() {
  sessionExpiredNotified = false;
}

function notifySessionExpired() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
}

// authed=true (الافتراضي) للطلبات اللي بتبعت توكن (Authorization header) —
// أي 401 منها معناه الجلسة بطلت. authed=false للطلبات العامة زي تسجيل
// الدخول/إنشاء حساب، لأن 401/400 منها معناه بيانات غلط بس، مش جلسة منتهية.
async function handle(res: Response, authed: boolean = true) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.maintenance) {
      throw new MaintenanceError(data.error || 'الموقع تحت الصيانة حاليًا');
    }
    if (res.status === 401 && authed) {
      notifySessionExpired();
      throw new SessionExpiredError(data.error || 'انتهت صلاحية جلستك');
    }
    throw new Error(data.error || `خطأ (${res.status})`);
  }
  return res.json();
}

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

// ===== التحقق بخطوتين (2FA) =====

export async function verifyLoginTwoFactor(pendingToken: string, code: string) {
  const res = await fetch(`${API_URL}/api/auth/2fa/verify-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pendingToken, code }),
  });
  return handle(res, false);
}

export async function getTwoFactorStatus(): Promise<{
  twoFactorEnabled: boolean;
  twoFactorEnabledAt: string | null;
}> {
  const res = await fetch(`${API_URL}/api/auth/2fa/status`, { headers: authHeaders() });
  return handle(res);
}

export async function setupTwoFactor(): Promise<{ secret: string; qrDataUrl: string }> {
  const res = await fetch(`${API_URL}/api/auth/2fa/setup`, { method: 'POST', headers: authHeaders() });
  return handle(res);
}

export async function enableTwoFactor(code: string): Promise<{ success: true; recoveryCodes: string[] }> {
  const res = await fetch(`${API_URL}/api/auth/2fa/enable`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ code }),
  });
  return handle(res);
}

export async function disableTwoFactor(password: string, code: string) {
  const res = await fetch(`${API_URL}/api/auth/2fa/disable`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ password, code }),
  });
  return handle(res);
}

// ===== مشغّل الصوت (بحث يوتيوب) =====
// بيكلّم مسار /api/youtube/search بتاع الباك إند بتاعنا بس — مفتاح
// YouTube API نفسه مش موجود هنا ولا في أي كود بيوصل للمتصفح، السيرفر هو
// اللي بيحتفظ بيه ويكلّم يوتيوب بالنيابة عننا (شوف backend/src/routes/youtube.ts).
export interface YoutubeSearchResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

export async function searchYoutube(query: string): Promise<YoutubeSearchResult[]> {
  const res = await fetch(`${API_URL}/api/youtube/search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
  });
  const data = await handle(res);
  return data.items || [];
}

export async function getLists() {
  const res = await fetch(`${API_URL}/api/lists`, { headers: authHeaders() });
  return handle(res);
}

export async function createList(
  title: string,
  priority?: string,
  category?: string | null,
  targetYear?: number | null,
  lifeAreaId?: string | null,
  startTime?: string | null,
  endTime?: string | null,
  parentGoalId?: string | null,
  targetMonth?: number | null,
  targetWeek?: number | null,
  targetDayOfWeek?: number | null
) {
  const res = await fetch(`${API_URL}/api/lists`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title,
      priority,
      category,
      targetYear,
      lifeAreaId,
      startTime,
      endTime,
      parentGoalId,
      targetMonth,
      targetWeek,
      targetDayOfWeek,
    }),
  });
  return handle(res);
}

export async function updateList(
  id: string,
  data: {
    title?: string;
    priority?: string;
    startTime?: string | null;
    endTime?: string | null;
    category?: string | null;
    targetYear?: number | null;
    targetMonth?: number | null;
    targetWeek?: number | null;
    targetDayOfWeek?: number | null;
    lifeAreaId?: string | null;
    parentGoalId?: string | null;
  }
) {
  const res = await fetch(`${API_URL}/api/lists/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

// ===== خريطة الأهداف الهرمية =====
// بترجع الأهداف المرشحة تتربط كـ"أب" لتصنيف معيّن (مثلاً كل الأهداف
// الشهرية النشطة لو category = 'WEEKLY') — بتُستخدم في خطوة "الهدف الأب"
// جوه ويزارد الإنشاء/التعديل. excludeId بيمنع ظهور الهدف نفسه كخيار لأبوه
// وقت التعديل.
export interface GoalOption {
  id: string;
  title: string;
  category: string | null;
  targetYear: number | null;
  targetMonth?: number | null;
  targetWeek?: number | null;
  targetDayOfWeek?: number | null;
}

export async function getGoalOptions(category: string, excludeId?: string): Promise<GoalOption[]> {
  const params = new URLSearchParams({ category });
  if (excludeId) params.set('excludeId', excludeId);
  const res = await fetch(`${API_URL}/api/lists/goal-options?${params.toString()}`, { headers: authHeaders() });
  return handle(res);
}

// تأكيد/إلغاء تأكيد الإنجاز النهائي للمهمة الرئيسية (مربع الـ Check في
// الكارت) — منفصل تمامًا عن تعليم المهام الفرعية. confirmListDone بيرفض
// الطلب من السيرفر لو لسه فيه مهام فرعية غير منجزة.
export async function confirmListDone(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/confirm-done`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ localDate: localDateKey() }),
  });
  return handle(res);
}

export async function unconfirmListDone(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/unconfirm-done`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

// ===== الأرشيف (Archive) =====

export async function getArchive() {
  const res = await fetch(`${API_URL}/api/archive`, { headers: authHeaders() });
  return handle(res);
}

export async function archiveList(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/archive`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

// بتبدأ استرجاع مهمة من الأرشيف — الخطوة الأولى بس: المهمة بتتحط في منطقة
// "بانتظار المراجعة" وبتظهر في قسم مخصص بالصفحة الرئيسية بدل ما ترجع
// لقائمة المهام النشطة فورًا. لإنهاء الاسترجاع فعليًا، استخدم finalizeRestore.
export async function restoreList(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

// بترجع كل المهام اللي استُرجعت من الأرشيف ولسه بانتظار مراجعة/تأكيد
// المستخدم قبل ما ترجع لقائمة المهام النشطة.
export async function getPendingRestoreLists() {
  const res = await fetch(`${API_URL}/api/lists/pending-restore`, { headers: authHeaders() });
  return handle(res);
}

// الخطوة الأخيرة من الاسترجاع: بتأكّد إرجاع المهمة فعليًا لمكانها الطبيعي
// في قائمة المهام النشطة بعد ما المستخدم راجعها/عدّلها في قسم "بانتظار المراجعة".
export async function finalizeRestore(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/finalize-restore`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

// ===== سلة المحذوفات المؤقتة (Trash) — حذف سنة كاملة من خريطة الأهداف =====

export interface TrashedYear {
  year: number;
  trashedAt: string;
  expiresAt: string;
  daysLeft: number;
  totalGoals: number;
  counts: { YEARLY: number; MONTHLY: number; WEEKLY: number; DAILY: number };
}

export async function getTrash(): Promise<TrashedYear[]> {
  const res = await fetch(`${API_URL}/api/trash`, { headers: authHeaders() });
  return handle(res);
}

export async function trashYear(year: number) {
  const res = await fetch(`${API_URL}/api/trash/years/${year}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function restoreTrashedYear(year: number) {
  const res = await fetch(`${API_URL}/api/trash/years/${year}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

// ===== مجالات الحياة (Life Areas) =====

export async function getLifeAreas(): Promise<LifeAreaData[]> {
  const res = await fetch(`${API_URL}/api/life-areas`, { headers: authHeaders() });
  return handle(res);
}

export async function createLifeArea(data: {
  name: string;
  color?: string;
  icon?: string | null;
  // parentId: مررها لو المجال الجديد ده مجال فرعي تابع لمجال موجود —
  // سيبها من غير تحديد (أو null) عشان يتنشئ كمجال جذري.
  parentId?: string | null;
}): Promise<LifeAreaData> {
  const res = await fetch(`${API_URL}/api/life-areas`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateLifeArea(
  id: string,
  data: { name?: string; color?: string; icon?: string | null; parentId?: string | null }
): Promise<LifeAreaData> {
  const res = await fetch(`${API_URL}/api/life-areas/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteLifeArea(id: string) {
  const res = await fetch(`${API_URL}/api/life-areas/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

// orderedIds: كل الإخوة (نفس parentId) بالترتيب الجديد الكامل. parentId:
// null (أو تسيبها) لإعادة ترتيب المجالات الجذرية، أو ID مجال أب لإعادة
// ترتيب فروعه المباشرة بس.
export async function reorderLifeAreas(orderedIds: string[], parentId: string | null = null) {
  const res = await fetch(`${API_URL}/api/life-areas/reorder`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ orderedIds, parentId }),
  });
  return handle(res);
}

// بيرفع صورة أيقونة مخصصة لمجال حياة كـ multipart/form-data.
export async function uploadLifeAreaIcon(id: string, file: File): Promise<LifeAreaData> {
  const formData = new FormData();
  formData.append('icon', file);
  const res = await fetch(`${API_URL}/api/life-areas/${id}/icon-image`, {
    method: 'POST',
    headers: authHeadersNoContentType(),
    body: formData,
  });
  return handle(res);
}

export async function removeLifeAreaIcon(id: string): Promise<LifeAreaData> {
  const res = await fetch(`${API_URL}/api/life-areas/${id}/icon-image`, {
    method: 'DELETE',
    headers: authHeadersNoContentType(),
  });
  return handle(res);
}

// صور أيقونات المجالات بترجع من السيرفر كمسار نسبي زي الأفتار بالظبط.
export function resolveLifeAreaImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  return `${API_URL}${imageUrl}`;
}

// ===== حذف هدف بكل تبعياته (خريطة العرض الكاملة) =====
// حذف نهائي فوري (بيمسح الهدف وكل الأهداف الفرعية تحته على كل المستويات)
// — محمي بكلمة مرور الحساب، شوف middleware/requireAccountPassword في
// الباك إند.
export async function deleteListCascade(id: string, password: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/delete-cascade`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ password }),
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

export async function addItem(listId: string, content: string, priority?: string) {
  const res = await fetch(`${API_URL}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ listId, content, priority }),
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

export async function updateItemPriority(id: string, priority: string) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ priority }),
  });
  return handle(res);
}

export async function updateItemContent(id: string, content: string) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  return handle(res);
}

export async function updateItemDueDate(id: string, dueDate: string | null) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ dueDate }),
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

// بيحدّث ترتيب أكتر من مهمة فرعية دفعة واحدة (بعد إعادة ترتيب من نافذة
// تعديل المهمة مثلًا) — كل عنصر بياخد position جديد حسب مكانه في المصفوفة.
export async function reorderItems(items: { id: string; position: number }[]) {
  const res = await fetch(`${API_URL}/api/items-reorder`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ items }),
  });
  return handle(res);
}

// ===== التذكيرات =====

export interface Reminder {
  id: string;
  userId: string;
  listId: string | null;
  itemId: string | null;
  mode: 'CUSTOM' | 'BEFORE_DUE';
  offsetMinutes: number | null;
  remindAt: string;
  message: string | null;
  isSent: boolean;
  sentAt: string | null;
  createdAt: string;
}

export async function getReminders(filter: { listId?: string; itemId?: string }) {
  const params = new URLSearchParams();
  if (filter.itemId) params.set('itemId', filter.itemId);
  else if (filter.listId) params.set('listId', filter.listId);
  const res = await fetch(`${API_URL}/api/reminders?${params.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<Reminder[]>;
}

export async function getDueReminders() {
  const res = await fetch(`${API_URL}/api/reminders/due`, { headers: authHeaders() });
  return handle(res) as Promise<Reminder[]>;
}

export async function createReminder(data: {
  listId?: string;
  itemId?: string;
  mode: 'CUSTOM' | 'BEFORE_DUE';
  remindAt?: string;
  offsetMinutes?: number;
  message?: string;
}) {
  const res = await fetch(`${API_URL}/api/reminders`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res) as Promise<Reminder>;
}

export async function updateReminder(
  id: string,
  data: { remindAt?: string; offsetMinutes?: number; message?: string }
) {
  const res = await fetch(`${API_URL}/api/reminders/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res) as Promise<Reminder>;
}

export async function deleteReminder(id: string) {
  const res = await fetch(`${API_URL}/api/reminders/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

// ===== إشعارات الجهاز (Web Push) =====

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

// ===== الاستريك (أيام الإنجاز المتتالية) =====

export async function getStreak(): Promise<{ current: number }> {
  const res = await fetch(`${API_URL}/api/streak?date=${localDateKey()}`, { headers: authHeaders() });
  return handle(res);
}

// ===== إشعارات الموقع (Inbox) =====

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  source: 'ADMIN' | 'SYSTEM';
  url: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function getNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const res = await fetch(`${API_URL}/api/notifications`, { headers: authHeaders() });
  return handle(res);
}

export async function markNotificationRead(id: string) {
  const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function markAllNotificationsRead() {
  const res = await fetch(`${API_URL}/api/notifications/read-all`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function deleteNotification(id: string) {
  const res = await fetch(`${API_URL}/api/notifications/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function sendAdminNotification(data: {
  title: string;
  body: string;
  username?: string;
  adminPassword: string;
}): Promise<{ success: true; count: number }> {
  const res = await fetch(`${API_URL}/api/admin/content/notifications/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function getAdminStats() {
  const res = await fetch(`${API_URL}/api/admin/stats`, { headers: authHeaders() });
  return handle(res);
}

export interface AdminUsersPage {
  users: AdminUserEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminUserEntry {
  id: string;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  legacyAccount: boolean;
  mustRehabilitate: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  _count: { lists: number };
}

export async function getAdminUsers(params: { q?: string; page?: number; pageSize?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 20));
  const res = await fetch(`${API_URL}/api/admin/users?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminUsersPage>;
}

export function exportAdminUsersUrl(q?: string) {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  return `${API_URL}/api/admin/users/export?${qs.toString()}`;
}

export async function downloadAdminUsersCsv(q?: string) {
  const res = await fetch(exportAdminUsersUrl(q), { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) {
      notifySessionExpired();
      throw new SessionExpiredError('انتهت صلاحية جلستك');
    }
    throw new Error('تعذّر تصدير الملف');
  }
  return res.blob();
}

export async function getAdminUserDetail(id: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, { headers: authHeaders() });
  return handle(res);
}

export async function deleteAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function suspendAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/suspend`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function forceLogoutAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/force-logout`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function resetAdminUserPassword(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/reset-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function unlockAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/unlock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export interface AdminAuditLogPage {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableActions: string[];
}

export interface LogEntry {
  id: string;
  adminUsername: string;
  targetUsername: string | null;
  action: string;
  ip: string | null;
  createdAt: string;
}

export async function getAdminAuditLog(
  params: { adminUsername?: string; action?: string; page?: number; pageSize?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.adminUsername) qs.set('adminUsername', params.adminUsername);
  if (params.action) qs.set('action', params.action);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 50));
  const res = await fetch(`${API_URL}/api/admin/audit-log?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminAuditLogPage>;
}

export async function downloadAdminAuditLogCsv(params: { adminUsername?: string; action?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.adminUsername) qs.set('adminUsername', params.adminUsername);
  if (params.action) qs.set('action', params.action);
  const res = await fetch(`${API_URL}/api/admin/audit-log/export?${qs.toString()}`, { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) {
      notifySessionExpired();
      throw new SessionExpiredError('انتهت صلاحية جلستك');
    }
    throw new Error('تعذّر تصدير الملف');
  }
  return res.blob();
}

export async function getAdminGrowthStats(): Promise<{ days: { date: string; count: number }[] }> {
  const res = await fetch(`${API_URL}/api/admin/stats/growth`, { headers: authHeaders() });
  return handle(res);
}

export async function updateAdminUser(
  id: string,
  data: { username?: string; isAdmin?: boolean },
  adminPassword: string
) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ ...data, adminPassword }),
  });
  return handle(res);
}

// ===== لوحة التحكم: التحليلات =====

export type AnalyticsRange = '7d' | '30d' | '90d' | '365d';

export interface TimeseriesPoint {
  date: string;
  count: number;
}

export interface AdminTimeseries {
  range: number;
  users: TimeseriesPoint[];
  itemsCreated: TimeseriesPoint[];
  itemsCompleted: TimeseriesPoint[];
}

export async function getAdminTimeseries(range: AnalyticsRange): Promise<AdminTimeseries> {
  const res = await fetch(`${API_URL}/api/admin/analytics/timeseries?range=${range}`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export interface AdminDistribution {
  priority: { NONE: number; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
  completionRate: number;
  avgItemsPerList: number;
  avgListsPerUser: number;
  emptyLists: number;
  totalItems: number;
  doneItems: number;
  totalLists: number;
  totalUsers: number;
}

export async function getAdminDistribution(): Promise<AdminDistribution> {
  const res = await fetch(`${API_URL}/api/admin/analytics/distribution`, { headers: authHeaders() });
  return handle(res);
}

export interface AdminTopUser {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  listsCount: number;
  itemsCount: number;
}

export async function getAdminTopUsers(): Promise<{ users: AdminTopUser[] }> {
  const res = await fetch(`${API_URL}/api/admin/analytics/top-users`, { headers: authHeaders() });
  return handle(res);
}

// ===== لوحة التحكم: إدارة المحتوى (قوائم/مهام كل المستخدمين) =====

export interface AdminListEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archiveReason: 'COMPLETED' | 'OVERDUE';
  pendingRestoreAt: string | null;
  user: { id: string; username: string };
  _count: { items: number };
}

export interface AdminListsPage {
  lists: AdminListEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAdminLists(
  params: { q?: string; status?: 'active' | 'archived' | 'overdue' | ''; page?: number; pageSize?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 20));
  const res = await fetch(`${API_URL}/api/admin/content/lists?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminListsPage>;
}

export async function updateAdminList(id: string, title: string) {
  const res = await fetch(`${API_URL}/api/admin/content/lists/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  return handle(res);
}

export async function deleteAdminList(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/content/lists/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

// استرجاع مهمة "متأخرة" اتؤرشفت تلقائيًا — ممنوع على المستخدم نفسه، الأدمن
// بس يقدر يعمله (شوف POST /lists/:id/restore-overdue في routes/adminContent.ts).
export async function restoreAdminOverdueList(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/content/lists/${id}/restore-overdue`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export interface AdminItemEntry {
  id: string;
  content: string;
  isDone: boolean;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  list: { id: string; title: string; user: { id: string; username: string } };
}

export interface AdminItemsPage {
  items: AdminItemEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAdminItems(
  params: { q?: string; priority?: string; status?: 'done' | 'pending' | ''; page?: number; pageSize?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.priority) qs.set('priority', params.priority);
  if (params.status) qs.set('status', params.status);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 20));
  const res = await fetch(`${API_URL}/api/admin/content/items?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminItemsPage>;
}

export async function updateAdminItem(
  id: string,
  data: { content?: string; isDone?: boolean; priority?: string; dueDate?: string | null }
) {
  const res = await fetch(`${API_URL}/api/admin/content/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteAdminItem(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/content/items/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

// ===== لوحة التحكم: إعدادات الموقع =====

export interface SiteSettings {
  siteName: string;
  registrationEnabled: string;
  maintenanceMode: string;
  maintenanceMessage: string;
  maintenanceEmoji: string;
  maxListsPerUser: string;
  maxItemsPerList: string;
  announcementBanner: string;
  [key: string]: string;
}

export async function getAdminSettings(): Promise<{ settings: SiteSettings }> {
  const res = await fetch(`${API_URL}/api/admin/settings`, { headers: authHeaders() });
  return handle(res);
}

export async function updateAdminSettings(settings: Partial<SiteSettings>, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/settings`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ settings, adminPassword }),
  });
  return handle(res) as Promise<{ settings: SiteSettings }>;
}

// ===== الملف الشخصي =====

export interface ProfileData {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  legacyAccount: boolean;
}

// صور الأفتار بترجع من السيرفر كمسار نسبي (مثلًا /uploads/avatars/xxx.jpg)،
// فلازم نضيف رابط السيرفر نفسه قبلها عشان نقدر نعرضها في <img>.
export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (/^https?:\/\//.test(avatarUrl)) return avatarUrl;
  return `${API_URL}${avatarUrl}`;
}

export interface ProfileStats {
  totalLists: number;
  completedLists: number;
  totalItems: number;
  doneItems: number;
  completionRate: number;
  priority: { NONE: number; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
}

export interface ProfileResponse {
  profile: ProfileData;
  stats: ProfileStats;
}

export async function getProfile(): Promise<ProfileResponse> {
  const res = await fetch(`${API_URL}/api/profile`, { headers: authHeaders() });
  return handle(res);
}

export async function updateProfile(data: {
  displayName?: string | null;
  bio?: string | null;
}): Promise<{ profile: ProfileData }> {
  const res = await fetch(`${API_URL}/api/profile`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

// بيرفع صورة الأفتار الجديدة كـ multipart/form-data ويرجع الملف الشخصي
// محدّث بمسار الصورة الجديدة.
export async function uploadAvatar(file: File): Promise<{ profile: ProfileData }> {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: authHeadersNoContentType(),
    body: formData,
  });
  return handle(res);
}

// بيشيل صورة الأفتار الحالية ويرجّع العرض لحرف اسمك الأول بدلها.
export async function removeAvatar(): Promise<{ profile: ProfileData }> {
  const res = await fetch(`${API_URL}/api/profile/avatar`, {
    method: 'DELETE',
    headers: authHeadersNoContentType(),
  });
  return handle(res);
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string
): Promise<{ token: string; message: string }> {
  const res = await fetch(`${API_URL}/api/profile/change-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
  });
  return handle(res);
}

export async function regenerateOwnRecoveryCode(currentPassword: string): Promise<{ recoveryCode: string }> {
  const res = await fetch(`${API_URL}/api/profile/regenerate-recovery-code`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword }),
  });
  return handle(res);
}

// ===== المهام المتكررة (Recurring Tasks) =====

export interface RecurringTaskItemData {
  id: string;
  content: string;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  position: number;
}

export interface RecurringTaskData {
  id: string;
  title: string;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  startDate: string;
  isActive: boolean;
  lastGeneratedAt: string | null;
  nextRunAt: string;
  lifeAreaId: string | null;
  lifeArea: { id: string; name: string; color: string; icon: string | null; imageUrl: string | null; parentId: string | null } | null;
  items: RecurringTaskItemData[];
  _count: { generatedLists: number };
}

export interface RecurringTaskInput {
  title: string;
  priority?: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  startDate: string;
  lifeAreaId?: string | null;
  items?: { content: string; priority?: string }[];
}

export async function getRecurringTasks(): Promise<RecurringTaskData[]> {
  const res = await fetch(`${API_URL}/api/recurring-tasks`, { headers: authHeaders() });
  return handle(res);
}

export async function createRecurringTask(data: RecurringTaskInput): Promise<RecurringTaskData> {
  const res = await fetch(`${API_URL}/api/recurring-tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateRecurringTask(
  id: string,
  data: Partial<RecurringTaskInput> & { isActive?: boolean }
): Promise<RecurringTaskData> {
  const res = await fetch(`${API_URL}/api/recurring-tasks/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function pauseRecurringTask(id: string): Promise<RecurringTaskData> {
  const res = await fetch(`${API_URL}/api/recurring-tasks/${id}/pause`, { method: 'POST', headers: authHeaders() });
  return handle(res);
}

export async function resumeRecurringTask(id: string): Promise<RecurringTaskData> {
  const res = await fetch(`${API_URL}/api/recurring-tasks/${id}/resume`, { method: 'POST', headers: authHeaders() });
  return handle(res);
}

export async function generateRecurringTaskNow(id: string) {
  const res = await fetch(`${API_URL}/api/recurring-tasks/${id}/generate-now`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function deleteRecurringTask(id: string) {
  const res = await fetch(`${API_URL}/api/recurring-tasks/${id}`, { method: 'DELETE', headers: authHeaders() });
  return handle(res);
}

// ===== حالة الموقع العامة (وضع الصيانة) =====

export interface SiteStatus {
  siteName: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceEmoji: string;
  registrationEnabled: boolean;
  announcementBanner: string;
}

export async function getSiteStatus(): Promise<SiteStatus> {
  const res = await fetch(`${API_URL}/api/site/status`);
  return handle(res, false);
}
