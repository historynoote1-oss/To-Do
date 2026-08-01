import { Router } from 'express';
import { searchQuranVideos, QuranSearchError } from '../services/quranSearch';

const router = Router();

// بحث عن فيديوهات يوتيوب (بيُستخدم في صفحة "مشغّل الصوت" وكمان في أمر
// "شغل ..." بتاع الأدمن جوه الغرف الصوتية). المنطق الفعلي اتنقل لملف
// services/quranSearch.ts عشان يتشارك بين المسار ده وبين realtime/voiceRooms.ts
// من غير تكرار كود.
router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    const items = await searchQuranVideos(q);
    res.json({ items });
  } catch (err) {
    if (err instanceof QuranSearchError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('YouTube search request failed:', err);
    res.status(502).json({ error: 'حصل خطأ في الاتصال، حاول تاني' });
  }
});

export default router;
