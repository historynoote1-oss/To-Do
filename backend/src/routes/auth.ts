import { Router } from 'express';

const router = Router();

// الخطوة الأولى: الفرونت إند بيبعت الـ code اللي جه من Discord، وإحنا بنستبدله
// بـ access_token باستخدام الـ client_secret (اللي محدش غير السيرفر يشوفه)
router.post('/token', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code مطلوب' });

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Discord token exchange failed:', data);
      return res.status(400).json(data);
    }

    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error('token exchange error:', err);
    res.status(500).json({ error: 'فشل تبادل الكود' });
  }
});

export default router;
