// ===== مشغّل الصوت (بحث يوتيوب) =====
// بيكلّم مسار /api/youtube/search بتاع الباك إند بتاعنا بس — مفتاح
// YouTube API نفسه مش موجود هنا ولا في أي كود بيوصل للمتصفح، السيرفر هو
// اللي بيحتفظ بيه ويكلّم يوتيوب بالنيابة عننا (شوف backend/src/routes/youtube.ts).

import { API_URL, authHeaders, handle } from './core';

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
  const responseBody = await handle(res);
  return responseBody.items || [];
}
