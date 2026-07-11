import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string;

if (!CLIENT_ID) {
  throw new Error(
    'VITE_DISCORD_CLIENT_ID مش موجود. اتأكد إنك ضايفه في Environment Variables على Vercel وعملت Redeploy بعدها.'
  );
}

export const discordSdk = new DiscordSDK(CLIENT_ID);

let cachedAuth: { access_token: string; guildId: string | null } | null = null;

// بتحط مهلة زمنية عشان لو فتحت الرابط بره Discord (من متصفح عادي)، تظهرلك
// رسالة واضحة بدل ما تفضل الشاشة معلقة على "جاري التحميل" من غير سبب واضح
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} استغرق وقت طويل من غير رد. لو بتفتح الرابط من متصفح عادي بره Discord، ده طبيعي — الـ Activity لازم تتفتح من جوه Discord نفسه (زرار 🚀 في الفويس تشانل).`
            )
          ),
        ms
      )
    ),
  ]);
}

export async function setupDiscordAuth() {
  if (cachedAuth) return cachedAuth;

  await withTimeout(discordSdk.ready(), 8000, 'discordSdk.ready()');

  const { code } = await withTimeout(
    discordSdk.commands.authorize({
      client_id: CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds'],
    }),
    15000,
    'طلب الصلاحيات (authorize)'
  );

  let response: Response;
  try {
    response = await fetch('/.proxy/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch (err) {
    throw new Error(
      'فشل الاتصال بالباك إند عن طريق /.proxy/api/token. اتأكد إن URL Mapping بتاع /api في Discord Developer Portal مظبوط صح.'
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`الباك إند رجّع خطأ (${response.status}): ${text || 'من غير تفاصيل'}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`الباك إند رد من غير access_token. الرد اللي جه: ${JSON.stringify(data)}`);
  }

  await withTimeout(
    discordSdk.commands.authenticate({ access_token: data.access_token }),
    8000,
    'authenticate()'
  );

  cachedAuth = {
    access_token: data.access_token,
    guildId: discordSdk.guildId,
  };
  return cachedAuth;
}
