import { prisma } from './prisma';

// القيم الافتراضية لكل إعداد — نفس القيم المستخدمة في routes/adminSettings.ts،
// موجودة هنا كمان عشان أي كود تاني (زي middleware الصيانة) يقدر يقرأها من غير
// اعتماد دائري على route الأدمن.
export const SITE_SETTINGS_DEFAULTS: Record<string, string> = {
  siteName: 'قوائم المهام',
  registrationEnabled: 'true',
  maintenanceMode: 'false',
  maintenanceMessage: 'الموقع تحت الصيانة حاليًا، هنرجع قريب 🛠️',
  maintenanceEmoji: '🛠️',
  maxListsPerUser: '0',
  maxItemsPerList: '0',
  announcementBanner: '',
};

// كاش بسيط في الذاكرة بعمر قصير جدًا (3 ثواني) عشان مانضربش قاعدة البيانات
// على كل request من كل مستخدم بس عشان نتأكد إن الموقع مش تحت الصيانة —
// الفرق بين 0 و3 ثواني في ظهور/اختفاء وضع الصيانة مش محسوس لحد، لكنه بيوفر
// حمل كبير جدًا على القاعدة وقت الزيارات العادية.
let cache: { data: Record<string, string>; expiresAt: number } | null = null;
const TTL_MS = 3000;

export async function getSiteSettings(): Promise<Record<string, string>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }
  const rows = await prisma.siteSetting.findMany();
  const map: Record<string, string> = { ...SITE_SETTINGS_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  cache = { data: map, expiresAt: Date.now() + TTL_MS };
  return map;
}

// لازم تتنادى فورًا بعد أي تعديل من لوحة تحكم الأدمن، عشان تفعيل/إلغاء وضع
// الصيانة (أو أي إعداد تاني) يتطبّق فورًا على كل الزوار من غير ما ننتظر
// انتهاء الكاش القديم.
export function invalidateSiteSettingsCache() {
  cache = null;
}
