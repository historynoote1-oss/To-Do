import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { requireAdminPassword } from '../middleware/requireAdminPassword';
import { hashPassword, generateTempPassword } from '../lib/auth';

const router = Router();

async function logAction(adminId: string, targetUserId: string | null, action: string, ip: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { username: true } });
  const target = targetUserId
    ? await prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true } })
    : null;
  await prisma.adminAuditLog.create({
    data: {
      adminUsername: admin?.username || 'unknown',
      targetUsername: target?.username || null,
      action,
      ip,
    },
  });
}

const userListSelect = {
  id: true,
  username: true,
  email: true,
  emailVerified: true,
  isAdmin: true,
  isActive: true,
  legacyAccount: true,
  mustRehabilitate: true,
  lastLoginAt: true,
  lastLoginIp: true,
  lastLoginUserAgent: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  createdAt: true,
  _count: { select: { lists: true } },
} as const;

router.get('/stats', async (_req, res) => {
  const [usersCount, listsCount, itemsCount, doneItemsCount, activeCount, lockedCount, adminCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.todoList.count(),
      prisma.todoItem.count(),
      prisma.todoItem.count({ where: { isDone: true } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      prisma.user.count({ where: { isAdmin: true } }),
    ]);

  res.json({ usersCount, listsCount, itemsCount, doneItemsCount, activeCount, lockedCount, adminCount });
});

// عدد الحسابات الجديدة يوم بيوم لآخر 30 يوم — بيستخدمها رسم بياني بسيط في
// أعلى اللوحة عشان الأدمن يشوف نمط النمو (أو أي طفرة مريبة في التسجيلات).
router.get('/stats/growth', async (_req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const dayBuckets = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    dayBuckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const u of users) {
    const key = u.createdAt.toISOString().slice(0, 10);
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) || 0) + 1);
  }

  res.json({
    days: Array.from(dayBuckets.entries()).map(([date, count]) => ({ date, count })),
  });
});

// دعم بحث باسم المستخدم + تصفح بالصفحات (page/pageSize) عشان اللوحة تفضل
// سريعة حتى لو عدد المستخدمين كبر كتير، بدل ما تجيب كل الصفوف مرة واحدة.
router.get('/users', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);

  const where = q ? { username: { contains: q, mode: 'insensitive' as const } } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userListSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) });
});

// تصدير كل المستخدمين (اللي بيطابقوا نفس فلتر البحث لو موجود) كملف CSV،
// عشان الأدمن يقدر يفتحه في Excel/Sheets أو يأرشفه بره الموقع.
// البيانات المُصدَّرة متعمّدة إنها بدون أي حاجة حساسة زي الباسورد المشفّر نفسه.
router.get('/users/export', async (req: AuthRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = q ? { username: { contains: q, mode: 'insensitive' as const } } : {};

  const users = await prisma.user.findMany({
    where,
    select: userListSelect,
    orderBy: { createdAt: 'desc' },
  });

  const header = [
    'username',
    'email',
    'emailVerified',
    'isAdmin',
    'isActive',
    'legacyAccount',
    'mustRehabilitate',
    'listsCount',
    'lastLoginAt',
    'lastLoginIp',
    'failedLoginAttempts',
    'lockedUntil',
    'createdAt',
  ];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = users.map((u) =>
    [
      u.username,
      u.email || '',
      u.emailVerified,
      u.isAdmin,
      u.isActive,
      u.legacyAccount,
      u.mustRehabilitate,
      u._count.lists,
      u.lastLoginAt?.toISOString() || '',
      u.lastLoginIp || '',
      u.failedLoginAttempts,
      u.lockedUntil?.toISOString() || '',
      u.createdAt.toISOString(),
    ]
      .map(escape)
      .join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');

  await logAction(req.userId!, null, 'تصدير قائمة المستخدمين CSV', req.ip!);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="users-${Date.now()}.csv"`);
  res.send('\uFEFF' + csv); // BOM عشان الحروف العربية (لو موجودة) تتفتح صح في Excel
});

router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      ...userListSelect,
      lists: {
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(user);
});

// تعديل شامل لبيانات أي حساب (اسم المستخدم + صلاحية الأدمن) — تحكم كامل
// من اللوحة بدل ما يحتاج أي وصول مباشر لقاعدة البيانات. إجراء حساس فمحتاج
// تأكيد بكلمة مرور الأدمن زي باقي العمليات الخطيرة.
router.patch('/users/:id', requireAdminPassword, async (req: AuthRequest, res) => {
  const { username, isAdmin } = req.body as { username?: string; isAdmin?: boolean };
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (isAdmin !== undefined && target.id === req.userId && isAdmin === false) {
    return res.status(400).json({ error: 'متقدرش تشيل صلاحية الأدمن من حسابك انت بنفسك' });
  }

  const data: any = {};
  if (username && username.trim() && username.trim() !== target.username) {
    const clash = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (clash) return res.status(400).json({ error: 'اسم المستخدم ده مستخدم بالفعل' });
    data.username = username.trim();
  }
  if (isAdmin !== undefined) data.isAdmin = isAdmin;

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'مفيش أي تعديل' });

  const updated = await prisma.user.update({ where: { id: target.id }, data, select: userListSelect });
  await logAction(
    req.userId!,
    target.id,
    `تعديل بيانات حساب${data.username ? ` (الاسم ← ${data.username})` : ''}${
      isAdmin !== undefined ? (isAdmin ? ' (تفعيل صلاحية أدمن)' : ' (إلغاء صلاحية أدمن)') : ''
    }`,
    req.ip!
  );
  res.json(updated);
});

// تعليق / إعادة تفعيل الحساب — يحتاج تأكيد بكلمة مرور الأدمن
router.patch('/users/:id/suspend', requireAdminPassword, async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (target.id === req.userId) {
    return res.status(400).json({ error: 'متقدرش تعلّق حسابك انت بنفسك' });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: !target.isActive },
  });

  await logAction(req.userId!, target.id, updated.isActive ? 'إعادة تفعيل حساب' : 'تعليق حساب', req.ip!);
  res.json({ isActive: updated.isActive });
});

// فك القفل المؤقت الناتج عن محاولات دخول فاشلة كتيرة — يحتاج تأكيد بكلمة مرور الأدمن
router.post('/users/:id/unlock', requireAdminPassword, async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  await prisma.user.update({
    where: { id: target.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  await logAction(req.userId!, target.id, 'فك قفل الحساب', req.ip!);
  res.json({ success: true });
});

// تسجيل خروج إجباري من كل الأجهزة (بيلغي كل الجلسات القديمة فورًا) — يحتاج تأكيد بكلمة مرور الأدمن
router.post('/users/:id/force-logout', requireAdminPassword, async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  await prisma.user.update({
    where: { id: target.id },
    data: { tokenVersion: { increment: 1 } },
  });

  await logAction(req.userId!, target.id, 'تسجيل خروج إجباري', req.ip!);
  res.json({ success: true });
});

// إعادة تعيين إجبارية لكلمة المرور — بيتولّد باسورد مؤقت عشوائي وبيتشفّر ويتخزن،
// وبيترجع نص واحد بس في الرد ده عشان الأدمن يديه للعضو يدويًا (تليجرام، رسالة، إلخ).
// الباسورد القديم بيتمسح تمامًا ومفيش أي طريقة ترجعله تاني. يحتاج تأكيد بكلمة مرور الأدمن.
router.post('/users/:id/reset-password', requireAdminPassword, async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
  });

  await logAction(req.userId!, target.id, 'إعادة تعيين كلمة المرور', req.ip!);
  res.json({ tempPassword });
});

// حذف حساب — يحتاج تأكيد بكلمة مرور الأدمن (أخطر إجراء في اللوحة)
router.delete('/users/:id', requireAdminPassword, async (req: AuthRequest, res) => {
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'متقدرش تحذف حسابك انت بنفسك من هنا' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  await logAction(req.userId!, user.id, 'حذف حساب', req.ip!);
  await prisma.user.delete({ where: { id: user.id } });
  res.json({ success: true });
});

// فلترة اختيارية باسم الأدمن و/أو نوع العملية، مع تصفح بالصفحات بدل حد ثابت
// (100 سجل بس زي الأول) عشان الأدمن يقدر يرجع لأي نقطة في التاريخ.
function auditLogWhere(req: { query: any }) {
  const adminUsername = typeof req.query.adminUsername === 'string' ? req.query.adminUsername.trim() : '';
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
  const where: Record<string, unknown> = {};
  if (adminUsername) where.adminUsername = { contains: adminUsername, mode: 'insensitive' };
  if (action) where.action = action;
  return where;
}

router.get('/audit-log', async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 200);
  const where = auditLogWhere(req);

  const [logs, total, distinctActions] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    }),
  ]);

  res.json({
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    availableActions: distinctActions.map((a) => a.action),
  });
});

// تصدير سجل العمليات (بنفس فلاتر الشاشة الحالية لو موجودة) كملف CSV للأرشفة
// أو المراجعة الخارجية — جزء مهم من "الحوكمة" اللي بتتطلبها معايير زي SOC 2.
router.get('/audit-log/export', async (req: AuthRequest, res) => {
  const where = auditLogWhere(req);
  const logs = await prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: 'desc' } });

  const header = ['createdAt', 'adminUsername', 'action', 'targetUsername', 'ip'];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = logs.map((l) =>
    [l.createdAt.toISOString(), l.adminUsername, l.action, l.targetUsername || '', l.ip || '']
      .map(escape)
      .join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');

  await logAction(req.userId!, null, 'تصدير سجل عمليات الأدمن CSV', req.ip!);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.csv"`);
  res.send('\uFEFF' + csv);
});

export default router;
