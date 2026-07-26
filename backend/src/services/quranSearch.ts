// ===== محرك بحث تلاوات القرآن عبر يوتيوب (مشترك) =====
// اتنقل من routes/youtube.ts عشان يتشارك بين مسار البحث العادي
// (/api/youtube/search بتاع صفحة "مشغّل القرآن") وبين أمر الأدمن
// "شغل ..." جوه شات الغرف الصوتية (realtime/voiceRooms.ts) — نفس الفحوصات
// والفلاتر بالظبط في المكانين، بدل ما تتكرر وتتفرق مع الوقت.

// المفتاح بيتقرأ من متغيرات البيئة على السيرفر بس (backend/.env، مش أي ملف
// بيوصل للمتصفح) — فمفيش داعي نسربّه لأي كود بيوصل لمتصفح المستخدم.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// مفروض الاستخدام يقتصر على تلاوات قرآنية بس، مش محرك بحث عام عن أغاني.
// الفحص ده بيتم هنا في السيرفر (مش بس في الواجهة) عشان يبقى الضمان الحقيقي.
const MUSIC_BLOCKLIST =
  /اغني|أغني|اغاني|أغاني|غناء|مهرجان|كليب|ريمكس|موسيقي|موسيقى|مزيكا|دي جي|راب\b|\bsong\b|\bsongs\b|\bmusic\b|\bremix\b|\blyrics?\b|\brap\b/i;

// كلمات بتدل على تلاوة قرآنية — لو مفيش ولا واحدة منها في البحث بنضيف
// "قرآن كريم" تلقائيًا، عشان نتايج يوتيوب تفضل محصورة في التلاوات.
const QURAN_HINT = /قرآن|قران|تلاوة|surah|quran|قارئ|القارئ/i;

function buildSafeQuery(raw: string): string {
  return QURAN_HINT.test(raw) ? raw : `${raw} قرآن كريم`;
}

interface YoutubeSearchApiItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
}

export interface QuranSearchItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

// خطأ مخصوص بيحمل كود حالة HTTP مناسب معاه، عشان أي حد بينادي الدالة
// (مسار REST أو الـ socket) يقدر يرجّع نفس الرسالة والحالة المناسبة.
export class QuranSearchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'QuranSearchError';
    this.status = status;
  }
}

export async function searchQuranVideos(rawQuery: string): Promise<QuranSearchItem[]> {
  const q = rawQuery.trim();
  if (!q) {
    throw new QuranSearchError(400, 'اكتب كلمة للبحث الأول');
  }
  if (q.length > 100) {
    throw new QuranSearchError(400, 'كلمة البحث طويلة جدًا');
  }
  if (MUSIC_BLOCKLIST.test(q)) {
    throw new QuranSearchError(400, 'الصفحة دي مخصّصة لتلاوات القرآن الكريم بس، مش أغاني أو موسيقى');
  }

  if (!YOUTUBE_API_KEY) {
    // الأدمن لسه محطّطش YOUTUBE_API_KEY في إعدادات السيرفر.
    throw new QuranSearchError(503, 'خاصية البحث الصوتي مش مفعّلة على السيرفر حاليًا');
  }

  const safeQuery = buildSafeQuery(q);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(safeQuery)}&key=${YOUTUBE_API_KEY}`;

  let ytRes: Response;
  let youtubeResponse: any;
  try {
    ytRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    youtubeResponse = await ytRes.json();
  } catch (err) {
    console.error('YouTube search request failed:', err);
    throw new QuranSearchError(502, 'حصل خطأ في الاتصال، حاول تاني');
  }

  if (!ytRes.ok || youtubeResponse.error) {
    console.error('YouTube search error:', youtubeResponse.error || ytRes.statusText);
    throw new QuranSearchError(502, 'تعذّر البحث حاليًا، حاول تاني بعد شوية');
  }

  const items = ((youtubeResponse.items || []) as YoutubeSearchApiItem[])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id!.videoId as string,
      title: item.snippet?.title || 'بدون عنوان',
      channel: item.snippet?.channelTitle || '',
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
    }))
    .filter((item) => !MUSIC_BLOCKLIST.test(item.title) && !MUSIC_BLOCKLIST.test(item.channel));

  return items;
}
