import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { hashPassword, comparePassword, signToken } from '../lib/auth';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبين' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'اسم المستخدم لازم يكون 3 أحرف على الأقل' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور لازم تكون 6 أحرف على الأقل' });
  }

  const existing = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (existing) {
    return res.status(409).json({ error: 'اسم المستخدم ده مستخدم بالفعل' });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username: username.trim(), passwordHash },
  });

  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, username: user.username, isAdmin: user.isAdmin });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبين' });
  }

  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غلط' });
  }
  if (!user.isActive) {
    return res.status(403).json({ error: 'الحساب ده متعلّق، تواصل مع إدارة الموقع' });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غلط' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: req.ip },
  });

  const token = signToken(user.id, user.tokenVersion);
  res.json({ token, username: user.username, isAdmin: user.isAdmin });
});

export default router;
