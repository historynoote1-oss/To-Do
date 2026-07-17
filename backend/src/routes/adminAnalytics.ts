import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// المدى الزمني المتاح لكل رسم بياني: قصير (أسبوع)، متوسط (شهر وربع سنة)، وبعيد (سنة كاملة)
const RANGE_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

function rangeDays(q: unknown): number {
  const key = typeof q === 'string' ? q : '30d';
  return RANGE_DAYS[key] || 30;
}

// بيبني خريطة فاضية لكل يوم في المدى المطلوب، عشان الأيام اللي مفيهاش نشاط
// تظهر بصفر بدل ما تختفي من الرسم البياني (ده اللي بيخلي الشكل متصل وصحيح).
function emptyDayBuckets(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  return { since, map };
}

function fillBuckets(map: Map<string, number>, dates: Date[]) {
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

// نظرة شاملة على النشاط عبر مدى زمني مرن (أسبوع/شهر/3 شهور/سنة) — تسجيلات
// جدد، مهام اتضافت، ومهام خلصت يوم بيوم، عشان يتابع الاتجاه قصير ومتوسط وبعيد المدى.
router.get('/timeseries', async (req, res) => {
  const days = rangeDays(req.query.range);
  const { since, map: usersMap } = emptyDayBuckets(days);
  const itemsMap = new Map(usersMap);
  const doneMap = new Map(usersMap);

  const [newUsers, newItems, doneItems] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.todoItem.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.todoItem.findMany({
      where: { isDone: true, updatedAt: { gte: since } },
      select: { updatedAt: true },
    }),
  ]);

  res.json({
    range: days,
    users: fillBuckets(usersMap, newUsers.map((u) => u.createdAt)),
    itemsCreated: fillBuckets(itemsMap, newItems.map((i) => i.createdAt)),
    itemsCompleted: fillBuckets(doneMap, doneItems.map((i) => i.updatedAt)),
  });
});

// توزيع المهام حسب الأولوية، ونسبة الإنجاز العامة، ومتوسط عدد المهام لكل قائمة —
// مؤشرات "صحة الاستخدام" العامة للموقع مش بس أعداد خام.
router.get('/distribution', async (_req, res) => {
  const [priorityGroups, totalItems, doneItems, totalLists, totalUsers, listsWithItems] = await Promise.all([
    prisma.todoItem.groupBy({ by: ['priority'], _count: { _all: true } }),
    prisma.todoItem.count(),
    prisma.todoItem.count({ where: { isDone: true } }),
    prisma.todoList.count(),
    prisma.user.count(),
    prisma.todoList.findMany({ select: { _count: { select: { items: true } } } }),
  ]);

  const priorityMap: Record<string, number> = { NONE: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const g of priorityGroups) priorityMap[g.priority] = g._count._all;

  const itemCounts = listsWithItems.map((l) => l._count.items).sort((a, b) => a - b);
  const emptyLists = itemCounts.filter((c) => c === 0).length;

  res.json({
    priority: priorityMap,
    completionRate: totalItems > 0 ? Math.round((doneItems / totalItems) * 1000) / 10 : 0,
    avgItemsPerList: totalLists > 0 ? Math.round((totalItems / totalLists) * 10) / 10 : 0,
    avgListsPerUser: totalUsers > 0 ? Math.round((totalLists / totalUsers) * 10) / 10 : 0,
    emptyLists,
    totalItems,
    doneItems,
    totalLists,
    totalUsers,
  });
});

// أكتر 10 مستخدمين نشاطًا (بعدد المهام)، عشان يشوف مين فعليًا بيستخدم الموقع بكثافة.
router.get('/top-users', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      createdAt: true,
      lastLoginAt: true,
      lists: { select: { _count: { select: { items: true } } } },
    },
  });

  const ranked = users
    .map((u) => ({
      id: u.id,
      username: u.username,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      listsCount: u.lists.length,
      itemsCount: u.lists.reduce((sum, l) => sum + l._count.items, 0),
    }))
    .sort((a, b) => b.itemsCount - a.itemsCount)
    .slice(0, 10);

  res.json({ users: ranked });
});

export default router;
