// مكتبة أصوات الأذان — قائمة القرّاء الجاهزين (ملفات رسمية موثوقة من نفس
// جهة توفير خدمة مواقيت الصلاة اللي بنستخدمها، aladhan.com، فمضمونة الشغل
// وما بتنكسرش فجأة)، بالإضافة لتخزين محلي دائم (IndexedDB) لأي ملف صوتي
// يرفعه المستخدم بنفسه — مفيش حد أقصى لعدد الملفات المرفوعة، فالمكتبة
// الفعلية بتكبر مع الوقت حسب ما المستخدم يضيف.

export interface Reciter {
  id: string;
  name: string;
  url: string;
}

// كل رابط هنا من cdn.aladhan.com — نفس المصدر الرسمي لخدمة مواقيت الصلاة
// المستخدمة في الصفحة، وده اللي بيضمن استقرار الروابط على المدى الطويل.
export const BUILT_IN_RECITERS: Reciter[] = [
  { id: 'a9', name: 'مشاري راشد العفاسي', url: 'https://cdn.aladhan.com/audio/adhans/a9.mp3' },
  { id: 'a7', name: 'مشاري راشد العفاسي (أداء آخر)', url: 'https://cdn.aladhan.com/audio/adhans/a7.mp3' },
  { id: 'a4', name: 'مشاري راشد العفاسي — قناة دبي وان', url: 'https://cdn.aladhan.com/audio/adhans/a4.mp3' },
  { id: 'a11', name: 'منصور الزهراني', url: 'https://cdn.aladhan.com/audio/adhans/a11-mansour-al-zahrani.mp3' },
  { id: 'a1', name: 'أحمد النفيس', url: 'https://cdn.aladhan.com/audio/adhans/a1.mp3' },
  { id: 'a2', name: 'حافظ مصطفى أوزجان — تركيا', url: 'https://cdn.aladhan.com/audio/adhans/a2.mp3' },
  { id: 'a3', name: 'أذان كارل جينكينز — Mass for Peace', url: 'https://cdn.aladhan.com/audio/adhans/a3.mp3' },
];

export const SILENT_RECITER_ID = 'silent';

const DB_NAME = 'prayerTimesAudio';
const STORE_NAME = 'customAdhans';
const DB_VERSION = 1;

export interface CustomAdhanMeta {
  id: string;
  name: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('التخزين المحلي (IndexedDB) مش متاح في المتصفح ده'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredCustomAdhan extends CustomAdhanMeta {
  blob: Blob;
}

export async function saveCustomAdhan(file: File): Promise<CustomAdhanMeta> {
  const db = await openDb();
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: StoredCustomAdhan = { id, name: file.name.replace(/\.[a-zA-Z0-9]+$/, ''), createdAt: Date.now(), blob: file };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return { id, name: record.name, createdAt: record.createdAt };
}

export async function listCustomAdhans(): Promise<CustomAdhanMeta[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredCustomAdhan[]) || [];
        resolve(rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getCustomAdhanBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as StoredCustomAdhan | undefined)?.blob ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteCustomAdhan(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // تجاهل بهدوء — أسوأ حالة إن الملف يفضل موجود، مش خطر
  }
}
