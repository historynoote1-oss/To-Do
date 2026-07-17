import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { syncListArchiveState } from '../lib/archive';
import { resolveActivityDay } from '../lib/localDate';

const router = Router();

// ===== خريطة الأهداف الهرمية =====
// بيوصف لكل تصنيف "التصنيف الأب" اللي المفروض تُبنى عليه — الهدف السنوي
// وحده هو قمة الهرم ومالوش أب. مستخدم في التحقق من صحة parentGoalId، وفي
// نقطة /goal-options اللي بترجع الأهداف المرشحة تتربط كأب لتصنيف معيّن.
const PARENT_CATEGORY_OF: Record<string, string> = {
  MONTHLY: 'YEARLY',
  WEEKLY: 'MONTHLY',
  DAILY: 'WEEKLY',
};

// بيتضاف لأي include بيرجّع مهمة رئيسية للواجهة — عشان الكارت يقدر يعرض
// شارة "الهدف الأب" (breadcrumb) ويحسب نسبة إنجاز الأهداف الفرعية المربوطة
// بيه من غير طلب إضافي. subGoals بيرجّع بس الحقول اللازمة لحساب التقدّم
// (خلص/لسه)، مش المهمة كاملة، عشان الحمولة تفضل خفيفة.
const GOAL_INCLUDE = {
  parentGoal: { select: { id: true, title: true, category: true, targetYear: true } },
  subGoals: {
    select: { id: true, title: true, category: true, archivedAt: true, archiveReason: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

// بترجع المهام الرئيسية "النشطة" بس (مش المؤرشفة، ومش اللي بانتظار مراجعة
// الاسترجاع من الأرشيف) — المهام المكتملة اللي اتؤرشفت (تلقائيًا أو يدويًا)
// بتتقرا من GET /api/archive بدالها، واللي بانتظار المراجعة بتتقرا من
// GET /api/lists/pending-restore بدالها.
router.get('/', async (req: AuthRequest, res) => {
  const lists = await prisma.todoList.findMany({
    where: { userId: req.userId!, archivedAt: null, pendingRestoreAt: null },
    include: {
      items: { orderBy: { position: 'asc' }, include: { _count: { select: { reminders: true } } } },
      _count: { select: { reminders: true } },
      lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } },
      ...GOAL_INCLUDE,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(lists);
});

// بترجع المهام اللي استُرجعت من الأرشيف ولسه بانتظار مراجعة/تأكيد المستخدم
// (شوف POST /:id/restore و/:id/finalize-restore تحت). بنفس تركيب GET /
// بالظبط عشان تقدر تستخدم نفس مكوّن عرض المهمة الرئيسية (TodoList) في
// الواجهة من غير أي تحويل إضافي.
router.get('/pending-restore', async (req: AuthRequest, res) => {
  const lists = await prisma.todoList.findMany({
    where: { userId: req.userId!, archivedAt: null, pendingRestoreAt: { not: null } },
    include: {
      items: { orderBy: { position: 'asc' }, include: { _count: { select: { reminders: true } } } },
      _count: { select: { reminders: true } },
      lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } },
      ...GOAL_INCLUDE,
    },
    orderBy: { pendingRestoreAt: 'desc' },
  });
  res.json(lists);
});

// بترجع الأهداف المرشحة تتربط كـ"أب" لتصنيف معيّن — مثلاً ?category=WEEKLY
// بترجع كل الأهداف الشهرية النشطة (غير المؤرشفة) بتاعة المستخدم، لأن
// الشهري هو أب الأسبوعي في الهرم. لو التصنيف سنوي (أو مش موجود في الهرم)
// بترجع مصفوفة فاضية لأنه مالوش أب أصلًا. بتُستخدم في خطوة "الهدف الأب"
// جوه ويزارد الإنشاء/التعديل.
router.get('/goal-options', async (req: AuthRequest, res) => {
  const category = String(req.query.category || '');
  const parentCategory = PARENT_CATEGORY_OF[category];
  if (!parentCategory) return res.json([]);

  const excludeId = typeof req.query.excludeId === 'string' ? req.query.excludeId : undefined;
  const options = await prisma.todoList.findMany({
    where: {
      userId: req.userId!,
      category: parentCategory as any,
      archivedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, title: true, category: true, targetYear: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(options);
});

// أرشفة يدوية — بتسمح للمستخدم يؤرشف مهمة رئيسية بنفسه حتى لو لسه مش
// مكتملة بالكامل (يخفيها من الشاشة الرئيسية من غير ما يحذفها نهائيًا).
router.post('/:id/archive', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });
  const updated = await prisma.todoList.update({
    where: { id: list.id },
    data: { archivedAt: list.archivedAt ?? new Date(), pendingRestoreAt: null },
    include: { lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } } },
  });
  res.json(updated);
});

// الخطوة الأولى من استرجاع مهمة من الأرشيف: المهمة بتتشال من الأرشيف
// (archivedAt = null) بس مبترجعش لقائمة المهام النشطة فورًا — بتتحط بدالها
// في منطقة "بانتظار المراجعة" (pendingRestoreAt = دلوقتي)، وبتظهر في قسم
// مخصص بالصفحة الرئيسية عشان المستخدم يراجعها ويعدّلها قبل ما يأكّدها
// نهائيًا بطلب /finalize-restore.
router.post('/:id/restore', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });
  // مهمة اتؤرشفت تلقائيًا لأنها فاتت معادها (تبويب "المهام المتأخرة") مينفعش
  // تتسترجع نهائيًا — شوف تعليق archiveReason في schema.prisma.
  if (list.archiveReason === 'OVERDUE') {
    return res.status(400).json({ error: 'المهمة دي اتنقلت لـ"المهام المتأخرة" تلقائيًا لأنها فاتت معادها، ومينفعش تتسترجع' });
  }
  const updated = await prisma.todoList.update({
    where: { id: list.id },
    data: { archivedAt: null, pendingRestoreAt: new Date() },
    include: { lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } } },
  });
  res.json(updated);
});

// الخطوة الثانية والأخيرة: المستخدم يضغط "إضافة المهمة" في قسم "بانتظار
// المراجعة" بالصفحة الرئيسية، فالمهمة بترجع فعليًا لمكانها الطبيعي في
// قائمة المهام النشطة (pendingRestoreAt = null). لازم تكون المهمة فعلاً
// بانتظار مراجعة (404 غير كده) عشان منسمحش بإنهاء استرجاع مهمة أصلًا نشطة.
router.post('/:id/finalize-restore', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId!, pendingRestoreAt: { not: null } },
  });
  if (!list) return res.status(404).json({ error: 'المهمة غير موجودة أو مش بانتظار المراجعة' });
  const updated = await prisma.todoList.update({
    where: { id: list.id },
    data: { pendingRestoreAt: null },
    include: { lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } } },
  });
  res.json(updated);
});

// تأكيد الإنجاز النهائي — دي مربع الـ Check بتاع المهمة الرئيسية في الكارت.
// مسموح بيه بس لو كل المهام الفرعية منجزة فعلاً (وفيه مهمة فرعية واحدة على
// الأقل)، وده اللي بيفرّق المهمة "خلصت فعلاً" عن مجرد "كل مهامها الفرعية
// معلّمة" — التأكيد ده هو اللي بيحصّل الأرشفة الفعلية (شوف lib/archive.ts).
router.post('/:id/confirm-done', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { items: { select: { isDone: true } } },
  });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });

  const total = list.items.length;
  const done = list.items.filter((i) => i.isDone).length;
  if (total === 0 || done !== total) {
    return res.status(400).json({ error: 'لازم تخلّص كل المهام الفرعية الأول قبل ما تأكّد إنهاء المهمة' });
  }

  await prisma.todoList.update({ where: { id: list.id }, data: { confirmedDone: true } });

  // بيسجّل النهاردة (بتوقيت المستخدم المحلي، مش السيرفر) كـ"يوم نشط" لحساب
  // الاستريك (شوف routes/streak.ts) — upsert عشان لو المستخدم أكّد أكتر من
  // مهمة في نفس اليوم يفضل صف واحد بس.
  const today = resolveActivityDay(req.body?.localDate);
  await prisma.userActivityDay.upsert({
    where: { userId_date: { userId: req.userId!, date: today } },
    update: {},
    create: { userId: req.userId!, date: today },
  });

  const updated = await syncListArchiveState(list.id, today);
  res.json(
    updated ?? (await prisma.todoList.findUnique({
      where: { id: list.id },
      include: { lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } } },
    }))
  );
});

// إلغاء تأكيد الإنجاز النهائي — بترجّع المربع لغير معلّم، ولو كانت المهمة
// اتؤرشفت بسبب التأكيد ده بترجع تلقائيًا للقائمة النشطة.
router.post('/:id/unconfirm-done', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });

  await prisma.todoList.update({ where: { id: list.id }, data: { confirmedDone: false } });
  const updated = await syncListArchiveState(list.id);
  res.json(
    updated ?? (await prisma.todoList.findUnique({
      where: { id: list.id },
      include: { lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } } },
    }))
  );
});

const VALID_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_CATEGORIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const MIN_YEAR = 1970;
const MAX_YEAR = 3000;

// بتقبل: undefined (معدلش)، null (مسح التصنيف)، أو واحدة من القيم الصحيحة.
// لو التصنيف مش YEARLY، بنتجاهل targetYear ونمسحه تلقائيًا عشان منسيبش
// سنة "يتيمة" متعلقة بتصنيف قديم اتغيّر.
function parseCategory(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !VALID_CATEGORIES.includes(value)) {
    throw new Error('تصنيف غير صحيح');
  }
  return value;
}

function parseTargetYear(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) {
    throw new Error('السنة المستهدفة غير صحيحة');
  }
  return n;
}

// بتقبل: undefined (معدلش)، null (مسح القيمة)، أو نص ISO صحيح. أي حاجة تانية
// (نص فاضي، تاريخ مش صحيح) بترفض الطلب كله عشان منسيبش startTime/endTime في
// حالة نص فاسد يكسر حساب الشريط الزمني في الواجهة.
function parseNullableDate(value: unknown, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} غير صحيح`);
  }
  return d;
}

// بتقبل: undefined (معدلش)، null (بدون مجال)، أو ID مجال فعلاً بيخص المستخدم
// نفسه. بترجع خطأ واضح لو المستخدم حاول يسند مهمته لمجال حد تاني أو مجال
// اتحذف بالفعل.
async function parseLifeAreaId(value: unknown, userId: string): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('مجال الحياة غير صحيح');
  const area = await prisma.lifeArea.findFirst({ where: { id: value, userId } });
  if (!area) throw new Error('مجال الحياة غير موجود');
  return value;
}

// بتقبل: undefined (معدلش)، null (مسح الربط)، أو ID هدف فعلاً بيخص
// المستخدم نفسه، نشط (مش مؤرشف)، وتصنيفه هو بالظبط "التصنيف الأب" المطلوب
// لـ finalCategory (شوف PARENT_CATEGORY_OF فوق). finalCategory لازم تتحسب
// بعد دمج القيمة الجديدة مع القديمة الأول (زي targetYear بالظبط) عشان
// التحقق يبقى صحيح حتى لو المستخدم بعت parentGoalId من غير ما يبعت category
// في نفس الطلب. الهدف السنوي (أو أي مهمة من غير تصنيف) مالهاش أب أبدًا.
async function parseParentGoalId(
  value: unknown,
  userId: string,
  finalCategory: string | null
): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('الهدف الأب غير صحيح');

  const requiredParentCategory = finalCategory ? PARENT_CATEGORY_OF[finalCategory] : undefined;
  if (!requiredParentCategory) {
    throw new Error('التصنيف الحالي مالوش هدف أب في الهرم');
  }

  const parent = await prisma.todoList.findFirst({ where: { id: value, userId, archivedAt: null } });
  if (!parent) throw new Error('الهدف الأب غير موجود');
  if (parent.category !== requiredParentCategory) {
    throw new Error('الهدف الأب لازم يكون من التصنيف الأعلى مباشرة في الهرم');
  }
  return value;
}

router.post('/', async (req: AuthRequest, res) => {
  const { priority } = req.body;
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'أولوية غير صحيحة' });
  }

  let startTime: Date | null | undefined;
  let endTime: Date | null | undefined;
  let category: string | null | undefined;
  let targetYear: number | null | undefined;
  let lifeAreaId: string | null | undefined;
  let parentGoalId: string | null | undefined;
  try {
    startTime = parseNullableDate(req.body.startTime, 'وقت البداية');
    endTime = parseNullableDate(req.body.endTime, 'وقت النهاية');
    category = parseCategory(req.body.category);
    targetYear = parseTargetYear(req.body.targetYear);
    lifeAreaId = await parseLifeAreaId(req.body.lifeAreaId, req.userId!);
    parentGoalId =
      req.body.parentGoalId === undefined
        ? undefined
        : await parseParentGoalId(req.body.parentGoalId, req.userId!, category ?? null);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }
  if (startTime && endTime && startTime.getTime() >= endTime.getTime()) {
    return res.status(400).json({ error: 'وقت البداية لازم يكون قبل وقت النهاية' });
  }
  // targetYear مالوش معنى غير مع تصنيف YEARLY.
  if (category !== 'YEARLY') targetYear = null;
  else if (!targetYear) targetYear = new Date().getFullYear();
  // الهدف السنوي قمة الهرم — مالوش أب أبدًا حتى لو اتبعت parentGoalId بالغلط.
  if (category === 'YEARLY') parentGoalId = null;

  try {
    const list = await prisma.todoList.create({
      data: {
        userId: req.userId!,
        title: req.body.title || 'قائمتي',
        priority: priority || 'NONE',
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        category: (category ?? undefined) as any,
        targetYear: targetYear ?? undefined,
        lifeAreaId: lifeAreaId ?? undefined,
        parentGoalId: parentGoalId ?? undefined,
      },
      include: {
        lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } },
        ...GOAL_INCLUDE,
      },
    });
    res.json(list);
  } catch (err) {
    res.status(400).json({ error: 'فيه مهمة رئيسية بنفس الاسم بالفعل' });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { subGoals: { select: { id: true } } },
  });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });

  if (req.body.priority !== undefined && !VALID_PRIORITIES.includes(req.body.priority)) {
    return res.status(400).json({ error: 'أولوية غير صحيحة' });
  }

  let startTime: Date | null | undefined;
  let endTime: Date | null | undefined;
  let category: string | null | undefined;
  let targetYear: number | null | undefined;
  let lifeAreaId: string | null | undefined;
  let parentGoalId: string | null | undefined;
  try {
    startTime = parseNullableDate(req.body.startTime, 'وقت البداية');
    endTime = parseNullableDate(req.body.endTime, 'وقت النهاية');
    category = parseCategory(req.body.category);
    targetYear = parseTargetYear(req.body.targetYear);
    lifeAreaId = await parseLifeAreaId(req.body.lifeAreaId, req.userId!);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  // القيمة النهائية بعد الدمج مع الموجود فعليًا — بنستخدمها في فحص الترتيب
  // عشان لو المستخدم عدّل وقت واحد بس (مثلاً غيّر النهاية وسايب البداية
  // زي ما هي)، لازم نتأكد إن الترتيب لسه صحيح مع القيمة القديمة.
  const finalStart = startTime === undefined ? list.startTime : startTime;
  const finalEnd = endTime === undefined ? list.endTime : endTime;
  if (finalStart && finalEnd && finalStart.getTime() >= finalEnd.getTime()) {
    return res.status(400).json({ error: 'وقت البداية لازم يكون قبل وقت النهاية' });
  }

  // لو التصنيف اتبعت في الطلب واتغيّر لحاجة غير YEARLY، بنمسح السنة المستهدفة
  // تلقائيًا. لو اتبعت YEARLY من غير سنة، بنستخدم سنة النهاردة كقيمة افتراضية
  // معقولة (أو نسيب السنة القديمة لو كانت المهمة أصلًا سنوية ومفيش سنة جديدة اتبعتت).
  const finalCategory = category === undefined ? list.category : category;
  if (finalCategory !== 'YEARLY') {
    targetYear = null;
  } else if (targetYear === undefined) {
    targetYear = list.targetYear ?? new Date().getFullYear();
  } else if (targetYear === null) {
    targetYear = new Date().getFullYear();
  }

  // مهمة ليها أهداف فرعية مربوطة بيها ومعنى الهرم بتاعها هيتكسر لو تصنيفها
  // اتغيّر فجأة (مثلاً هدف شهري ليه أهداف أسبوعية بيتحول لتصنيف يومي) —
  // بنمنع تغيير التصنيف في الحالة دي، ولازم المستخدم يفك ربط الأهداف
  // الفرعية الأول لو فعلًا عاوز يغيّر التصنيف.
  if (category !== undefined && category !== list.category && list.subGoals.length > 0) {
    return res.status(400).json({ error: 'لازم تفك ربط الأهداف الفرعية عن الهدف ده الأول قبل ما تغيّر تصنيفه' });
  }

  try {
    parentGoalId =
      req.body.parentGoalId === undefined
        ? undefined
        : await parseParentGoalId(req.body.parentGoalId, req.userId!, finalCategory ?? null);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }
  // الهدف السنوي قمة الهرم — مالوش أب أبدًا.
  if (finalCategory === 'YEARLY') parentGoalId = null;

  const updated = await prisma.todoList.update({
    where: { id: list.id },
    data: {
      title: req.body.title ?? list.title,
      priority: req.body.priority ?? list.priority,
      startTime,
      endTime,
      category: category === undefined ? undefined : ((category as any) ?? null),
      targetYear,
      lifeAreaId: lifeAreaId === undefined ? undefined : lifeAreaId,
      parentGoalId: parentGoalId === undefined ? undefined : parentGoalId,
    },
    include: {
      lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } },
      ...GOAL_INCLUDE,
    },
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });
  // مهمة "متأخرة" مؤرشفة تلقائيًا لازم تفضل موجودة كسجل دائم — مينفعش تتحذف
  // نهائيًا، بنفس فلسفة عدم إمكانية استرجاعها.
  if (list.archiveReason === 'OVERDUE') {
    return res.status(400).json({ error: 'مينفعش تحذف مهمة متأخرة اتؤرشفت تلقائيًا' });
  }

  await prisma.todoList.delete({ where: { id: list.id } });
  res.json({ success: true });
});

export default router;
