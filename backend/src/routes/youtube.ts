import { Router } from 'express';

const router = Router();

// المفتاح بيتقرأ من متغيرات البيئة على السيرفر بس (backend/.env، مش أي ملف
// بيوصل للمتصفح). ده الفرق الجوهري عن نسخة الـ HTML القديمة اللي كانت بتحط
// المفتاح صراحةً جوه كود الصفحة نفسها: أي حد يفتح "عرض المصدر" كان يقدر
// ياخده وينسخه. هنا الفرونت إند بيكلّم مسار /api/youtube/search بتاعنا
// بس، والسيرفر هو اللي بيضيف المفتاح ويكلّم يوتيوب من ورا الكواليس —
// فالمفتاح مش موجود خالص في أي كود بيوصل لمتصفح المستخدم.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

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

// بحث عن فيديوهات يوتيوب (بيُستخدم في صفحة "مشغّل الصوت"). بيرجّع بس
// الحقول اللي الواجهة محتاجاها (معرّف الفيديو، العنوان، القناة، الصورة
// المصغّرة) — مش رد يوتيوب الخام، عشان مفيش داعي نسرّب أي تفاصيل زيادة.
router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    return res.status(400).json({ error: 'اكتب كلمة للبحث الأول' });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: 'كلمة البحث طويلة جدًا' });
  }

  if (!YOUTUBE_API_KEY) {
    // الأدمن لسه محطّطش YOUTUBE_API_KEY في إعدادات السيرفر — بنرجّع رسالة
    // واضحة بدل ما نكسر الطلب بخطأ غامض.
    return res.status(503).json({ error: 'خاصية البحث الصوتي مش مفعّلة على السيرفر حاليًا' });
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;
    const ytRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await ytRes.json();

    if (!ytRes.ok || data.error) {
      // بنطبع تفاصيل الخطأ في لوج السيرفر بس (يفيد في تشخيص مشاكل زي انتهاء
      // الحصة اليومية للمفتاح)، ومنرجّعش أي تفاصيل خام للمتصفح.
      console.error('YouTube search error:', data.error || ytRes.statusText);
      return res.status(502).json({ error: 'تعذّر البحث حاليًا، حاول تاني بعد شوية' });
    }

    const items = ((data.items || []) as YoutubeSearchApiItem[])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id!.videoId as string,
        title: item.snippet?.title || 'بدون عنوان',
        channel: item.snippet?.channelTitle || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
      }));

    res.json({ items });
  } catch (err) {
    console.error('YouTube search request failed:', err);
    res.status(502).json({ error: 'حصل خطأ في الاتصال، حاول تاني' });
  }
});

export default router;
