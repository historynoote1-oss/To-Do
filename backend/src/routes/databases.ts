import { Router } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { Prisma } from '@prisma/client';

const router = Router();

const MAX_NAME_LEN = 60;
const MAX_PROPERTY_NAME_LEN = 40;
const MAX_OPTION_LEN = 30;
const MAX_SELECT_OPTIONS = 30;
const PROPERTY_TYPES = ['text', 'number', 'select', 'multiSelect', 'date', 'checkbox', 'relation'] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];
const MAX_RELATION_VALUES = 200;

// ===== تحقق من صحة اسم (قاعدة بيانات أو خاصية) =====
function validateName(value: unknown, maxLen: number, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} مطلوب`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new Error(`${label} لازم يكون أقل من ${maxLen} حرف`);
  }
  return trimmed;
}

function validatePropertyType(value: unknown): PropertyType {
  if (typeof value !== 'string' || !PROPERTY_TYPES.includes(value as PropertyType)) {
    throw new Error('نوع الخاصية غير مدعوم');
  }
  return value as PropertyType;
}

// خيارات select/multiSelect: مصفوفة { value, color }. بنتحقق من الشكل هنا
// عشان مفيش أي طريقة تانية للبيانات دي توصل غلط للفرونت إند بعد كده.
interface SelectOption {
  value: string;
  color: string;
}
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validateOptions(type: PropertyType, raw: unknown): SelectOption[] | undefined {
  if (type !== 'select' && type !== 'multiSelect') return undefined;
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_SELECT_OPTIONS) {
    throw new Error(`أقصى عدد اختيارات هو ${MAX_SELECT_OPTIONS}`);
  }
  const seen = new Set<string>();
  const cleaned: SelectOption[] = [];
  for (const item of raw) {
    const value = validateName((item as any)?.value, MAX_OPTION_LEN, 'اسم الاختيار');
    if (seen.has(value)) throw new Error('فيه اختيارين بنفس الاسم');
    seen.add(value);
    const color = typeof (item as any)?.color === 'string' && HEX_COLOR_RE.test((item as any).color)
      ? (item as any).color
      : '#7c3aed';
    cleaned.push({ value, color });
  }
  return cleaned;
}

// ===== تتأكد إن قيمة خاصية متوافقة مع نوعها قبل ما تتخزن =====
function normalizeValue(type: PropertyType, options: SelectOption[] | undefined, raw: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (raw === null || raw === undefined || raw === '') return Prisma.JsonNull;
  switch (type) {
    case 'text':
      if (typeof raw !== 'string') throw new Error('القيمة لازم تكون نص');
      return raw;
    case 'number': {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(num)) throw new Error('القيمة لازم تكون رقم');
      return num;
    }
    case 'checkbox':
      if (typeof raw !== 'boolean') throw new Error('القيمة لازم تكون صح/خطأ');
      return raw;
    case 'date': {
      const date = new Date(raw as string);
      if (Number.isNaN(date.getTime())) throw new Error('تاريخ غير صحيح');
      return date.toISOString();
    }
    case 'select': {
      if (typeof raw !== 'string') throw new Error('القيمة لازم تكون نص');
      const allowed = new Set((options ?? []).map((o) => o.value));
      if (!allowed.has(raw)) throw new Error('الاختيار ده مش موجود ضمن خيارات الخاصية');
      return raw;
    }
    case 'multiSelect': {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
        throw new Error('القيمة لازم تكون قائمة نصوص');
      }
      const allowed = new Set((options ?? []).map((o) => o.value));
      for (const v of raw) {
        if (!allowed.has(v)) throw new Error('فيه اختيار مش موجود ضمن خيارات الخاصية');
      }
      return raw as string[];
    }
    case 'relation': {
      // بيتحقق من الشكل بس (مصفوفة IDs نصية فريدة) — التحقق إن الصفوف دي
      // فعلاً موجودة وضمن القاعدة الهدف بيحصل بعد كده (async) في الراوت
      // نفسه، لأن الفانكشن دي sync ومحتاجة استعلام لقاعدة البيانات.
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !v)) {
        throw new Error('القيمة لازم تكون قائمة IDs لصفوف مرتبطة');
      }
      if (raw.length > MAX_RELATION_VALUES) {
        throw new Error(`أقصى عدد صفوف مرتبطة هو ${MAX_RELATION_VALUES}`);
      }
      return Array.from(new Set(raw as string[]));
    }
    default:
      throw new Error('نوع خاصية غير معروف');
  }
}

// ===== بعد normalizeValue، بيتحقق إن كل IDs المرتبطة في خصائص relation فعلاً
// موجودة كصفوف ضمن القاعدة الهدف بتاعة كل خاصية. لازم يتنادى بعد التحقق من
// الشكل وقبل أي كتابة فعلية في قاعدة البيانات. =====
async function validateRelationTargets(
  entries: { propertyId: string; value: any }[],
  propertyById: Map<string, { type: string; relatedDatabaseId?: string | null }>
): Promise<string | null> {
  const idsByTargetDb = new Map<string, Set<string>>();
  for (const { propertyId, value } of entries) {
    const property = propertyById.get(propertyId);
    if (!property || property.type !== 'relation' || !Array.isArray(value) || value.length === 0) continue;
    if (!property.relatedDatabaseId) return 'الخاصية دي مش مربوطة بقاعدة بيانات هدف';
    const set = idsByTargetDb.get(property.relatedDatabaseId) ?? new Set<string>();
    for (const id of value as string[]) set.add(id);
    idsByTargetDb.set(property.relatedDatabaseId, set);
  }
  for (const [relatedDatabaseId, ids] of idsByTargetDb) {
    const found = await prisma.databaseRow.count({ where: { id: { in: Array.from(ids) }, databaseId: relatedDatabaseId } });
    if (found !== ids.size) return 'فيه صف مرتبط مش موجود ضمن القاعدة الهدف';
  }
  return null;
}

function serializeDatabase(db: any) {
  return {
    id: db.id,
    name: db.name,
    icon: db.icon,
    color: db.color,
    lifeAreaId: db.lifeAreaId ?? null,
    position: db.position,
    viewType: db.viewType === 'board' ? 'board' : 'table',
    boardGroupById: db.boardGroupById ?? null,
    createdAt: db.createdAt,
    updatedAt: db.updatedAt,
    properties: (db.properties ?? [])
      .slice()
      .sort((a: any, b: any) => a.position - b.position)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        options: p.options ?? [],
        position: p.position,
        relatedDatabaseId: p.relatedDatabaseId ?? null,
        relatedDatabaseName: p.relatedDatabase?.name ?? null,
        relatedDatabaseIcon: p.relatedDatabase?.icon ?? null,
        relatedDatabaseColor: p.relatedDatabase?.color ?? null,
      })),
  };
}

function serializeProperty(p: any) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    options: p.options ?? [],
    position: p.position,
    relatedDatabaseId: p.relatedDatabaseId ?? null,
    relatedDatabaseName: p.relatedDatabase?.name ?? null,
    relatedDatabaseIcon: p.relatedDatabase?.icon ?? null,
    relatedDatabaseColor: p.relatedDatabase?.color ?? null,
  };
}

function serializeRow(row: any, properties?: any[]) {
  const values: Record<string, unknown> = {};
  for (const v of row.values ?? []) {
    values[v.propertyId] = v.value;
  }
  const linkedTask = row.linkedTodoList
    ? {
        id: row.linkedTodoList.id,
        title: row.linkedTodoList.title,
        confirmedDone: row.linkedTodoList.confirmedDone,
        archivedAt: row.linkedTodoList.archivedAt,
      }
    : null;
  // label بيتحسب بنفس منطق deriveRowTitle، ومعروض هنا عشان أي مكان تاني
  // (زي خاصية relation في قاعدة تانية) يقدر يعرض اسم مفهوم للصف من غير ما
  // يحتاج يجيب كل الخصائص بنفسه ويعيد نفس الحساب.
  const label = properties ? deriveRowTitle(properties, row) : undefined;
  return { id: row.id, position: row.position, createdAt: row.createdAt, updatedAt: row.updatedAt, values, linkedTask, label };
}

const LINKED_TASK_INCLUDE = {
  linkedTodoList: { select: { id: true, title: true, confirmedDone: true, archivedAt: true } },
} as const;

// خصائص القاعدة + (لو فيه خصائص relation) اسم/أيقونة/لون القاعدة الهدف بتاعة
// كل واحدة، عشان الفرونت إند يعرضها من غير ما يحتاج يجيب القاعدة الهدف كاملة.
const PROPERTIES_INCLUDE = {
  properties: { include: { relatedDatabase: { select: { id: true, name: true, icon: true, color: true } } } },
} as const;

// ===== بتشتق عنوان مبدئي للمهمة من أول قيمة موجودة في الصف (بترتيب
// الخصائص) — لو الصف كله فاضي، بترجع عنوان افتراضي عام. =====
function deriveRowTitle(properties: any[], row: any): string {
  const sorted = properties.slice().sort((a, b) => a.position - b.position);
  const valueByProperty = new Map<string, any>((row.values ?? []).map((v: any) => [v.propertyId, v.value]));
  for (const property of sorted) {
    const value = valueByProperty.get(property.id);
    if (value === null || value === undefined || value === '') continue;
    switch (property.type) {
      case 'text':
        return String(value).slice(0, 120);
      case 'number':
        return `${property.name}: ${value}`;
      case 'select':
        return String(value);
      case 'multiSelect':
        return Array.isArray(value) && value.length ? value.join('، ') : '';
      case 'date':
        return `${property.name}: ${String(value).slice(0, 10)}`;
      case 'checkbox':
        continue; // مش مفيد كعنوان
      case 'relation':
        continue; // IDs بس، مش نص مفيد كعنوان
      default:
        continue;
    }
  }
  return 'صف بدون عنوان';
}

// ===== قائمة كل قواعد البيانات بتاعة المستخدم (مع خصائصها) =====
// دعم فلترة اختيارية بمجال حياة: GET /api/databases?lifeAreaId=xxx
router.get('/', async (req: AuthRequest, res) => {
  const lifeAreaId = typeof req.query.lifeAreaId === 'string' ? req.query.lifeAreaId : undefined;
  const databases = await prisma.customDatabase.findMany({
    where: { userId: req.userId!, ...(lifeAreaId ? { lifeAreaId } : {}) },
    include: PROPERTIES_INCLUDE,
    orderBy: { position: 'asc' },
  });
  res.json(databases.map(serializeDatabase));
});

// ===== إنشاء قاعدة بيانات جديدة (بدون خصائص لسه — بتتضاف بعد كده) =====
router.post('/', async (req: AuthRequest, res) => {
  let name: string;
  try {
    name = validateName(req.body.name, MAX_NAME_LEN, 'اسم القاعدة');
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const lifeAreaId: string | null = req.body.lifeAreaId || null;
  if (lifeAreaId) {
    const area = await prisma.lifeArea.findFirst({ where: { id: lifeAreaId, userId: req.userId! } });
    if (!area) return res.status(400).json({ error: 'مجال الحياة غير موجود ضمن مجالاتك' });
  }

  const last = await prisma.customDatabase.findFirst({
    where: { userId: req.userId! },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const db = await prisma.customDatabase.create({
    data: {
      userId: req.userId!,
      name,
      icon: typeof req.body.icon === 'string' ? req.body.icon : null,
      color: typeof req.body.color === 'string' && HEX_COLOR_RE.test(req.body.color) ? req.body.color : '#7c3aed',
      lifeAreaId,
      position: (last?.position ?? -1) + 1,
    },
    include: PROPERTIES_INCLUDE,
  });
  res.json(serializeDatabase(db));
});

// ===== تفاصيل قاعدة بيانات واحدة: خصائصها + كل صفوفها وقيمها =====
router.get('/:id', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: {
      ...PROPERTIES_INCLUDE,
      rows: { include: { values: true, ...LINKED_TASK_INCLUDE }, orderBy: { position: 'asc' } },
    },
  });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  res.json({ ...serializeDatabase(db), rows: db.rows.map((row) => serializeRow(row, db.properties)) });
});

// ===== تعديل اسم/أيقونة/لون/مجال حياة قاعدة بيانات، أو تبديل نوع العرض
// (viewType: table/board) وخاصية التجميع (boardGroupById) لعرض الكانبان =====
router.patch('/:id', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: PROPERTIES_INCLUDE,
  });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });

  let name: string | undefined;
  try {
    if (req.body.name !== undefined) name = validateName(req.body.name, MAX_NAME_LEN, 'اسم القاعدة');
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  let lifeAreaId: string | null | undefined;
  if (req.body.lifeAreaId !== undefined) {
    lifeAreaId = req.body.lifeAreaId || null;
    if (lifeAreaId) {
      const area = await prisma.lifeArea.findFirst({ where: { id: lifeAreaId, userId: req.userId! } });
      if (!area) return res.status(400).json({ error: 'مجال الحياة غير موجود ضمن مجالاتك' });
    }
  }

  let viewType: string | undefined;
  if (req.body.viewType !== undefined) {
    if (req.body.viewType !== 'table' && req.body.viewType !== 'board') {
      return res.status(400).json({ error: 'نوع عرض غير مدعوم' });
    }
    viewType = req.body.viewType;
  }

  let boardGroupById: string | null | undefined;
  if (req.body.boardGroupById !== undefined) {
    boardGroupById = req.body.boardGroupById || null;
    if (boardGroupById) {
      const property = db.properties.find((p) => p.id === boardGroupById);
      if (!property) return res.status(400).json({ error: 'الخاصية غير موجودة ضمن القاعدة' });
      if (property.type !== 'select') {
        return res.status(400).json({ error: 'التجميع في عرض الكانبان بيشتغل بخاصية من نوع اختيار واحد بس' });
      }
    }
  }

  const updated = await prisma.customDatabase.update({
    where: { id: db.id },
    data: {
      name,
      lifeAreaId,
      icon: req.body.icon !== undefined ? req.body.icon : undefined,
      color: req.body.color !== undefined && HEX_COLOR_RE.test(req.body.color) ? req.body.color : undefined,
      viewType,
      boardGroupById,
    },
    include: PROPERTIES_INCLUDE,
  });
  res.json(serializeDatabase(updated));
});

// ===== حذف قاعدة بيانات (بيتحذف معاها خصائصها وصفوفها تلقائيًا، Cascade) =====
router.delete('/:id', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  await prisma.customDatabase.delete({ where: { id: db.id } });
  res.json({ success: true });
});

// ===== إضافة خاصية (عمود) جديدة لقاعدة بيانات =====
router.post('/:id/properties', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });

  let name: string;
  let type: PropertyType;
  let options: SelectOption[] | undefined;
  try {
    name = validateName(req.body.name, MAX_PROPERTY_NAME_LEN, 'اسم الخاصية');
    type = validatePropertyType(req.body.type);
    options = validateOptions(type, req.body.options);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  // ===== المرحلة 4: خاصية relation لازم تحدد قاعدة هدف (ممكن تكون نفس
  // القاعدة الحالية — self-relation) وتتأكد إنها مملوكة للمستخدم نفسه =====
  let relatedDatabaseId: string | null = null;
  if (type === 'relation') {
    relatedDatabaseId = typeof req.body.relatedDatabaseId === 'string' ? req.body.relatedDatabaseId : '';
    if (!relatedDatabaseId) {
      return res.status(400).json({ error: 'لازم تختار القاعدة اللي هتترتبط بيها' });
    }
    const target = await prisma.customDatabase.findFirst({ where: { id: relatedDatabaseId, userId: req.userId! } });
    if (!target) return res.status(400).json({ error: 'القاعدة الهدف غير موجودة ضمن قواعدك' });
  }

  const last = await prisma.databaseProperty.findFirst({
    where: { databaseId: db.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const property = await prisma.databaseProperty.create({
    data: {
      databaseId: db.id,
      name,
      type,
      options: options ?? Prisma.JsonNull,
      position: (last?.position ?? -1) + 1,
      relatedDatabaseId,
    },
    include: { relatedDatabase: { select: { id: true, name: true, icon: true, color: true } } },
  });
  res.json(serializeProperty(property));
});

// ===== تعديل خاصية (اسمها أو خياراتها لو select/multiSelect) — نوعها
// نفسه ثابت بعد الإنشاء، عشان تغييره ممكن يسيب قيم صفوف مش متوافقة معاه =====
router.patch('/:id/properties/:propertyId', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const property = await prisma.databaseProperty.findFirst({ where: { id: req.params.propertyId, databaseId: db.id } });
  if (!property) return res.status(404).json({ error: 'الخاصية غير موجودة' });

  let name: string | undefined;
  let options: SelectOption[] | undefined;
  try {
    if (req.body.name !== undefined) name = validateName(req.body.name, MAX_PROPERTY_NAME_LEN, 'اسم الخاصية');
    if (req.body.options !== undefined) {
      options = validateOptions(property.type as PropertyType, req.body.options);
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const updated = await prisma.databaseProperty.update({
    where: { id: property.id },
    data: { name, options: options !== undefined ? options : undefined },
    include: { relatedDatabase: { select: { id: true, name: true, icon: true, color: true } } },
  });
  res.json(serializeProperty(updated));
});

// ===== حذف خاصية (بيتحذف معاها كل قيمها في كل الصفوف، Cascade) =====
router.delete('/:id/properties/:propertyId', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const property = await prisma.databaseProperty.findFirst({ where: { id: req.params.propertyId, databaseId: db.id } });
  if (!property) return res.status(404).json({ error: 'الخاصية غير موجودة' });
  await prisma.databaseProperty.delete({ where: { id: property.id } });
  res.json({ success: true });
});

// ===== إعادة ترتيب الخصائص (الأعمدة) =====
router.post('/:id/properties/reorder', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ترتيب غير صحيح' });
  }
  const owned = await prisma.databaseProperty.findMany({ where: { databaseId: db.id, id: { in: orderedIds } }, select: { id: true } });
  if (owned.length !== orderedIds.length) return res.status(400).json({ error: 'فيه خاصية غير موجودة ضمن القاعدة' });

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) => prisma.databaseProperty.update({ where: { id }, data: { position: index } }))
  );
  res.json({ success: true });
});

// ===== إضافة صف جديد (فاضي، أو بقيم مبدئية اختيارية) =====
router.post('/:id/rows', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: PROPERTIES_INCLUDE,
  });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });

  const rawValues: Record<string, unknown> = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
  const propertyById = new Map(db.properties.map((p) => [p.id, p]));

  let valuesToCreate: { propertyId: string; value: any }[];
  try {
    valuesToCreate = Object.entries(rawValues).map(([propertyId, raw]) => {
      const property = propertyById.get(propertyId);
      if (!property) throw new Error('فيه خاصية غير موجودة ضمن القاعدة');
      return { propertyId, value: normalizeValue(property.type as PropertyType, (property.options as any) ?? [], raw) };
    });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const relationError = await validateRelationTargets(valuesToCreate, propertyById as any);
  if (relationError) return res.status(400).json({ error: relationError });

  const last = await prisma.databaseRow.findFirst({
    where: { databaseId: db.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const row = await prisma.databaseRow.create({
    data: {
      databaseId: db.id,
      position: (last?.position ?? -1) + 1,
      values: { create: valuesToCreate },
    },
    include: { values: true, ...LINKED_TASK_INCLUDE },
  });
  res.json(serializeRow(row, db.properties));
});

// ===== تعديل قيمة خاصية واحدة (أو أكتر) في صف — بيرسل خرائط
// { propertyId: value } الجزء اللي اتغيّر بس =====
router.patch('/:id/rows/:rowId', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: PROPERTIES_INCLUDE,
  });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const row = await prisma.databaseRow.findFirst({ where: { id: req.params.rowId, databaseId: db.id } });
  if (!row) return res.status(404).json({ error: 'الصف غير موجود' });

  const rawValues: Record<string, unknown> = req.body.values && typeof req.body.values === 'object' ? req.body.values : {};
  const propertyById = new Map(db.properties.map((p) => [p.id, p]));

  let normalized: { propertyId: string; value: any }[];
  try {
    normalized = Object.entries(rawValues).map(([propertyId, raw]) => {
      const property = propertyById.get(propertyId);
      if (!property) throw new Error('فيه خاصية غير موجودة ضمن القاعدة');
      return { propertyId, value: normalizeValue(property.type as PropertyType, (property.options as any) ?? [], raw) };
    });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const relationError = await validateRelationTargets(normalized, propertyById as any);
  if (relationError) return res.status(400).json({ error: relationError });

  await prisma.$transaction(
    normalized.map(({ propertyId, value }) =>
      prisma.databaseRowValue.upsert({
        where: { rowId_propertyId: { rowId: row.id, propertyId } },
        update: { value },
        create: { rowId: row.id, propertyId, value },
      })
    )
  );
  await prisma.databaseRow.update({ where: { id: row.id }, data: {} }); // بيحدّث updatedAt

  const updated = await prisma.databaseRow.findUnique({ where: { id: row.id }, include: { values: true, ...LINKED_TASK_INCLUDE } });
  res.json(serializeRow(updated, db.properties));
});

// ===== حذف صف =====
router.delete('/:id/rows/:rowId', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const row = await prisma.databaseRow.findFirst({ where: { id: req.params.rowId, databaseId: db.id } });
  if (!row) return res.status(404).json({ error: 'الصف غير موجود' });
  await prisma.databaseRow.delete({ where: { id: row.id } });
  res.json({ success: true });
});

// ===== المرحلة 3: تحويل صف لمهمة فعلية في قائمة المهام =====
// بيعمل TodoList حقيقي (نفس اللي بيتعمل من صفحة المهام العادية) وبيربطه
// بالصف. لو الصف مربوط بمهمة بالفعل، بيرجع خطأ واضح بدل ما يعمل تانية.
router.post('/:id/rows/:rowId/convert-to-task', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: PROPERTIES_INCLUDE,
  });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const row = await prisma.databaseRow.findFirst({
    where: { id: req.params.rowId, databaseId: db.id },
    include: { values: true, ...LINKED_TASK_INCLUDE },
  });
  if (!row) return res.status(404).json({ error: 'الصف غير موجود' });
  if (row.linkedTodoListId) return res.status(400).json({ error: 'الصف ده متحول لمهمة بالفعل' });

  const baseTitle = deriveRowTitle(db.properties, row);

  async function tryCreate(title: string) {
    return prisma.todoList.create({
      data: { userId: req.userId!, title, lifeAreaId: db.lifeAreaId ?? undefined },
    });
  }

  let task;
  try {
    task = await tryCreate(baseTitle);
  } catch {
    // فيه مهمة بنفس العنوان بالفعل — نجرب عنوان مميّز بلاحقة قصيرة من الصف
    try {
      task = await tryCreate(`${baseTitle} (${row.id.slice(-5)})`);
    } catch {
      return res.status(400).json({ error: 'فيه مهمة بنفس الاسم بالفعل، جرّب تغيّر بيانات الصف الأول' });
    }
  }

  const updated = await prisma.databaseRow.update({
    where: { id: row.id },
    data: { linkedTodoListId: task.id },
    include: { values: true, ...LINKED_TASK_INCLUDE },
  });
  res.json(serializeRow(updated, db.properties));
});

// ===== فك ربط صف عن مهمته — المهمة نفسها بتفضل موجودة في قائمة المهام،
// بس الصف بيرجع "مش مربوط" =====
router.post('/:id/rows/:rowId/unlink-task', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! }, include: PROPERTIES_INCLUDE });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const row = await prisma.databaseRow.findFirst({ where: { id: req.params.rowId, databaseId: db.id } });
  if (!row) return res.status(404).json({ error: 'الصف غير موجود' });

  const updated = await prisma.databaseRow.update({
    where: { id: row.id },
    data: { linkedTodoListId: null },
    include: { values: true, ...LINKED_TASK_INCLUDE },
  });
  res.json(serializeRow(updated, db.properties));
});

// ===== إعادة ترتيب الصفوف =====
router.post('/:id/rows/reorder', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ترتيب غير صحيح' });
  }
  const owned = await prisma.databaseRow.findMany({ where: { databaseId: db.id, id: { in: orderedIds } }, select: { id: true } });
  if (owned.length !== orderedIds.length) return res.status(400).json({ error: 'فيه صف غير موجود ضمن القاعدة' });

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) => prisma.databaseRow.update({ where: { id }, data: { position: index } }))
  );
  res.json({ success: true });
});

export default router;
