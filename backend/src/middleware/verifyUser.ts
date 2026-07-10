import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  userId?: string;
  guildId?: string;
}

// بيتأكد إن الـ access_token الجاي من الفرونت إند حقيقي وبيرجع هوية اليوزر
// عن طريق سؤال Discord نفسه، عشان محدش يقدر ينتحل شخصية عضو تاني
export async function verifyUser(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'مفيش توكن مبعوت' });
  }
  const token = authHeader.slice(7);

  try {
    const discordRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!discordRes.ok) {
      return res.status(401).json({ error: 'توكن غير صالح أو منتهي' });
    }

    const user = (await discordRes.json()) as { id: string };
    req.userId = user.id;
    req.guildId = (req.headers['x-guild-id'] as string) || 'unknown';
    next();
  } catch (err) {
    console.error('verifyUser error:', err);
    res.status(500).json({ error: 'فشل التحقق من الهوية' });
  }
}
