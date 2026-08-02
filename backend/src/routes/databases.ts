import { Router } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { Prisma } from '@prisma/client';

const router = Router();

const MAX_NAME_LEN = 60;
const MAX_PROPERTY_NAME_LEN = 40;
const MAX_OPTION_LEN = 30;
const MAX_SELECT_OPTIONS = 30;
const PROPERTY_TYPES = ['text', 'number', 'select', 'multiSelect', 'date', 'checkbox', 'relation', 'rollup'] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];
const MAX_RELATION_VALUES = 200;

// ===== المرحلة 5: Rollup =====
const ROLLUP_AGGREGATIONS = ['count', 'sum', 'average', 'min', 'max', 'showValues'] as const;
type RollupAggregation = (typeof ROLLUP_AGGREGATIONS)[number];
interface RollupConfig {
  relationPropertyId: string;
  targetPropertyId: string | null;
  aggregation: RollupAggregation;
}

function validateRollupConfig(raw: unknown, ownProperties: { id: string; type: string; relatedDatabaseId?: string | null }[]): RollupConfig {
  const body = (raw && typeof raw === 'object' ? raw : {}) as any;
  const relationPropertyId = typeof body.relationPropertyId === 'string' ? body.relationPropertyId : '';
  const relationProperty = ownProperties.find((p) => p.id === relationPropertyId);
  if (!relationProperty || relationProperty.type !== 'relation') {
    throw new Error('لازم تختار خاصية ربط (relation) موجودة في نفس القاعدة');
  }
  const aggregation = typeof body.aggregation === 'string' && ROLLUP_AGGREGATIONS.includes(body.aggregation as RollupAggregation)
    ? (body.aggregation as RollupAggregation)
    : 'count';
  let targetPropertyId: string | null = null;
  if (aggregation !== 'count') {
    targetPropertyId = typeof body.targetPropertyId === 'string' ? body.targetPropertyId : '';
    if (!targetPropertyId) throw new Error('لازم تختار الخاصية اللي هيتم التجميع عليها من القاعدة المرتبطة');
  }
  return { relationPropertyId, targetPropertyId, aggregation };
}

// ===== المرحلة 5: Views متعددة محفوظة =====
const VIEW_TYPES = ['table', 'board', 'calendar'] as const;
type SavedViewType = (typeof VIEW_TYPES)[number];

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
    case 'rollup':
      // قيمة الـ rollup بتتحسب تلقائيًا وقت القراءة، مينفعش المستخدم يعدّلها
      // يدوي زي باقي الخصائص.
      throw new Error('قيمة خاصية الـ Rollup بتتحسب تلقائيًا، مينفعش تتعدّل يدوي');
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
        options: p.type === 'rollup' ? [] : (p.options ?? []),
        rollupConfig: p.type === 'rollup' ? (p.options ?? null) : null,
        position: p.position,
        relatedDatabaseId: p.relatedDatabaseId ?? null,
        relatedDatabaseName: p.relatedDatabase?.name ?? null,
        relatedDatabaseIcon: p.relatedDatabase?.icon ?? null,
        relatedDatabaseColor: p.relatedDatabase?.color ?? null,
      })),
  };
}

function serializeSavedView(v: any) {
  return {
    id: v.id,
    name: v.name,
    type: v.type === 'board' || v.type === 'calendar' ? v.type : 'table',
    boardGroupById: v.boardGroupById ?? null,
    calendarDateById: v.calendarDateById ?? null,
    filters: Array.isArray(v.filters) ? v.filters : [],
    sorts: Array.isArray(v.sorts) ? v.sorts : [],
    position: v.position,
  };
}

// ===== المرحلة 5: لو القاعدة لسه معندهاش أي Saved Views (قواعد قديمة قبل
// إضافة الميزة)، بننشئ view افتراضي واحد ليها ماخوذ من viewType/boardGroupById
// القديمين (لو موجودين)، عشان الانتقال يبقى شفاف من غير أي حاجة تتكسر. =====
async function ensureDefaultView(db: { id: string; viewType: string; boardGroupById: string | null }) {
  const existing = await prisma.databaseSavedView.findMany({ where: { databaseId: db.id }, orderBy: { position: 'asc' } });
  if (existing.length > 0) return existing;
  const created = await prisma.databaseSavedView.create({
    data: {
      databaseId: db.id,
      name: db.viewType === 'board' ? 'كانبان' : 'الجدول الرئيسي',
      type: db.viewType === 'board' ? 'board' : 'table',
      boardGroupById: db.boardGroupById ?? null,
      position: 0,
    },
  });
  return [created];
}

function serializeProperty(p: any) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    // لخصائص select/multiSelect دي مصفوفة خيارات؛ لخصائص rollup دي إعدادات
    // التجميع ({ relationPropertyId, targetPropertyId, aggregation })؛ لأي
    // نوع تاني بترجع مصفوفة فاضية.
    options: p.type === 'rollup' ? [] : (p.options ?? []),
    rollupConfig: p.type === 'rollup' ? (p.options ?? null) : null,
    position: p.position,
    relatedDatabaseId: p.relatedDatabaseId ?? null,
    relatedDatabaseName: p.relatedDatabase?.name ?? null,
    relatedDatabaseIcon: p.relatedDatabase?.icon ?? null,
    relatedDatabaseColor: p.relatedDatabase?.color ?? null,
  };
}

function serializeRow(
  row: any,
  properties?: any[],
  computedRollups?: Record<string, any>,
  reverseRelations?: any[]
) {
  const values: Record<string, unknown> = {};
  for (const v of row.values ?? []) {
    values[v.propertyId] = v.value;
  }
  // قيم الـ rollup محسوبة، مش متخزنة — بتتدمج فوق أي قيمة قديمة اتخزنت غلط
  if (computedRollups) {
    for (const [propertyId, value] of Object.entries(computedRollups)) {
      values[propertyId] = value;
    }
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
  return {
    id: row.id,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    values,
    linkedTask,
    label,
    reverseRelations: reverseRelations ?? [],
  };
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

// ===== المرحلة 5: بتحسب قيم كل خصائص الـ rollup لمجموعة صفوف. القيمة
// المحسوبة بترجع في خريطة rowId -> { propertyId: computedValue } عشان
// serializeRow يقدر يدمجها فوق القيم العادية بدون ما تتخزن في القاعدة. =====
async function computeRollups(properties: any[], rows: { id: string; values: { propertyId: string; value: any }[] }[]) {
  const result = new Map<string, Record<string, any>>(rows.map((r) => [r.id, {}]));
  const rollupProps = properties.filter((p) => p.type === 'rollup');
  if (rollupProps.length === 0 || rows.length === 0) return result;

  for (const prop of rollupProps) {
    const config = (prop.options ?? {}) as Partial<RollupConfig>;
    const relationProperty = properties.find((p) => p.id === config.relationPropertyId);
    if (!relationProperty || relationProperty.type !== 'relation') continue;
    const aggregation: RollupAggregation = (config.aggregation as RollupAggregation) ?? 'count';

    const relationIdsByRow = new Map<string, string[]>();
    const neededIds = new Set<string>();
    for (const row of rows) {
      const v = row.values.find((vv) => vv.propertyId === relationProperty.id);
      const ids = Array.isArray(v?.value) ? (v!.value as string[]) : [];
      relationIdsByRow.set(row.id, ids);
      ids.forEach((id) => neededIds.add(id));
    }

    let targetValueById = new Map<string, any>();
    if (aggregation !== 'count' && config.targetPropertyId && neededIds.size > 0) {
      const values = await prisma.databaseRowValue.findMany({
        where: { propertyId: config.targetPropertyId, rowId: { in: Array.from(neededIds) } },
      });
      targetValueById = new Map(values.map((v) => [v.rowId, v.value]));
    }

    for (const row of rows) {
      const ids = relationIdsByRow.get(row.id) ?? [];
      let computed: any;
      if (aggregation === 'count') {
        computed = ids.length;
      } else {
        const rawValues = ids.map((id) => targetValueById.get(id)).filter((v) => v !== undefined && v !== null);
        if (aggregation === 'showValues') {
          computed = rawValues;
        } else {
          const nums = rawValues.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
          if (aggregation === 'sum') computed = nums.reduce((a, b) => a + b, 0);
          else if (aggregation === 'average') computed = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          else if (aggregation === 'min') computed = nums.length ? Math.min(...nums) : null;
          else if (aggregation === 'max') computed = nums.length ? Math.max(...nums) : null;
          else computed = null;
        }
      }
      result.get(row.id)![prop.id] = computed;
    }
  }
  return result;
}

// ===== المرحلة 5: الربط ثنائي الاتجاه — بتحسب لكل صف مين "بيشاور عليه" من
// قواعد بيانات تانية (أو من نفس القاعدة) عن طريق خاصية relation مستهدفاه.
// النتيجة للعرض بس (read-only)، القيمة الحقيقية متخزنة في القاعدة المصدر. =====
async function computeReverseRelations(databaseId: string, rowIds: string[]) {
  const result = new Map<string, any[]>(rowIds.map((id) => [id, []]));
  if (rowIds.length === 0) return { descriptors: [] as any[], byRow: result };

  const incomingProperties = await prisma.databaseProperty.findMany({
    where: { relatedDatabaseId: databaseId, type: 'relation' },
    include: {
      database: { select: { id: true, name: true, icon: true, color: true, properties: { orderBy: { position: 'asc' } } } },
    },
  });
  if (incomingProperties.length === 0) return { descriptors: [] as any[], byRow: result };

  const descriptors = incomingProperties.map((p) => ({
    propertyId: p.id,
    propertyName: p.name,
    sourceDatabaseId: p.database.id,
    sourceDatabaseName: p.database.name,
    sourceDatabaseIcon: p.database.icon,
    sourceDatabaseColor: p.database.color,
  }));

  const rowIdSet = new Set(rowIds);
  for (const prop of incomingProperties) {
    const values = await prisma.databaseRowValue.findMany({
      where: { propertyId: prop.id },
      include: { row: { include: { values: true } } },
    });
    for (const v of values) {
      const arr = Array.isArray(v.value) ? (v.value as string[]) : [];
      for (const targetRowId of arr) {
        if (!rowIdSet.has(targetRowId)) continue;
        const label = deriveRowTitle(prop.database.properties, v.row);
        const bucket = result.get(targetRowId)!;
        let entry = bucket.find((e: any) => e.propertyId === prop.id);
        if (!entry) {
          entry = {
            propertyId: prop.id,
            propertyName: prop.name,
            sourceDatabaseId: prop.database.id,
            sourceDatabaseName: prop.database.name,
            rows: [],
          };
          bucket.push(entry);
        }
        entry.rows.push({ id: v.row.id, label });
      }
    }
  }
  return { descriptors, byRow: result };
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

  const [rollupsByRow, reverse, views] = await Promise.all([
    computeRollups(db.properties, db.rows),
    computeReverseRelations(db.id, db.rows.map((r) => r.id)),
    ensureDefaultView(db),
  ]);

  res.json({
    ...serializeDatabase(db),
    rows: db.rows.map((row) => serializeRow(row, db.properties, rollupsByRow.get(row.id), reverse.byRow.get(row.id))),
    reverseRelationDescriptors: reverse.descriptors,
    views: views.map(serializeSavedView),
  });
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
  const db = await prisma.customDatabase.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: PROPERTIES_INCLUDE,
  });
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

  // ===== المرحلة 5: خاصية rollup لازم تحدد خاصية relation (من نفس القاعدة)
  // وتجميع صحيح؛ إعداداتها بتتخزن في options زي خيارات select بالظبط =====
  let rollupConfig: RollupConfig | undefined;
  if (type === 'rollup') {
    try {
      rollupConfig = validateRollupConfig(req.body.rollupConfig, db.properties as any);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'إعدادات الـ Rollup غير صحيحة' });
    }
    if (rollupConfig.targetPropertyId) {
      const relationProperty = db.properties.find((p) => p.id === rollupConfig!.relationPropertyId);
      const targetProperty = await prisma.databaseProperty.findFirst({
        where: { id: rollupConfig.targetPropertyId, databaseId: relationProperty?.relatedDatabaseId ?? '__none__' },
      });
      if (!targetProperty) return res.status(400).json({ error: 'الخاصية الهدف غير موجودة ضمن القاعدة المرتبطة' });
    }
  }

  const last = await prisma.databaseProperty.findFirst({
    where: { databaseId: db.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const optionsJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
    type === 'rollup' ? (rollupConfig as unknown as Prisma.InputJsonValue) : ((options as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull);

  const property = await prisma.databaseProperty.create({
    data: {
      databaseId: db.id,
      name,
      type,
      options: optionsJson,
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
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! }, include: PROPERTIES_INCLUDE });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const property = db.properties.find((p) => p.id === req.params.propertyId);
  if (!property) return res.status(404).json({ error: 'الخاصية غير موجودة' });

  let name: string | undefined;
  let options: SelectOption[] | undefined;
  let rollupConfig: RollupConfig | undefined;
  try {
    if (req.body.name !== undefined) name = validateName(req.body.name, MAX_PROPERTY_NAME_LEN, 'اسم الخاصية');
    if (req.body.options !== undefined) {
      options = validateOptions(property.type as PropertyType, req.body.options);
    }
    if (property.type === 'rollup' && req.body.rollupConfig !== undefined) {
      rollupConfig = validateRollupConfig(
        req.body.rollupConfig,
        db.properties.filter((p) => p.id !== property.id) as any
      );
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const optionsJsonPatch: Prisma.InputJsonValue | undefined =
    rollupConfig !== undefined
      ? (rollupConfig as unknown as Prisma.InputJsonValue)
      : options !== undefined
        ? (options as unknown as Prisma.InputJsonValue)
        : undefined;

  const updated = await prisma.databaseProperty.update({
    where: { id: property.id },
    data: {
      name,
      options: optionsJsonPatch,
    },
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
  const rollupsByRow = await computeRollups(db.properties, [row]);
  res.json(serializeRow(row, db.properties, rollupsByRow.get(row.id)));
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
  const [rollupsByRow, reverse] = await Promise.all([
    computeRollups(db.properties, [updated as any]),
    computeReverseRelations(db.id, [row.id]),
  ]);
  res.json(serializeRow(updated, db.properties, rollupsByRow.get(row.id), reverse.byRow.get(row.id)));
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
      data: { userId: req.userId!, title, lifeAreaId: db!.lifeAreaId ?? undefined },
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
  const [rollupsByRow, reverse] = await Promise.all([
    computeRollups(db.properties, [updated as any]),
    computeReverseRelations(db.id, [row.id]),
  ]);
  res.json(serializeRow(updated, db.properties, rollupsByRow.get(row.id), reverse.byRow.get(row.id)));
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
  const [rollupsByRow, reverse] = await Promise.all([
    computeRollups(db.properties, [updated as any]),
    computeReverseRelations(db.id, [row.id]),
  ]);
  res.json(serializeRow(updated, db.properties, rollupsByRow.get(row.id), reverse.byRow.get(row.id)));
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

// ===================================================================
// ===== المرحلة 5: Views متعددة محفوظة (Table/Board/Calendar) =====
// ===================================================================

const MAX_VIEW_NAME_LEN = 40;
const MAX_VIEWS_PER_DATABASE = 20;

function validateFiltersAndSorts(raw: unknown, label: string): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (raw === undefined) return Prisma.JsonNull;
  if (!Array.isArray(raw)) throw new Error(`${label} لازم تكون قائمة`);
  if (raw.length > 20) throw new Error(`${label} كتير أوي`);
  return raw as Prisma.InputJsonValue;
}

// ===== قائمة الـ Views المحفوظة لقاعدة (بتنشئ واحد افتراضي لو مفيش) =====
router.get('/:id/views', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const views = await ensureDefaultView(db);
  res.json(views.map(serializeSavedView));
});

// ===== إنشاء View جديد =====
router.post('/:id/views', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! }, include: PROPERTIES_INCLUDE });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });

  const count = await prisma.databaseSavedView.count({ where: { databaseId: db.id } });
  if (count >= MAX_VIEWS_PER_DATABASE) return res.status(400).json({ error: `أقصى عدد Views هو ${MAX_VIEWS_PER_DATABASE}` });

  let name: string;
  try {
    name = validateName(req.body.name, MAX_VIEW_NAME_LEN, 'اسم الـ View');
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }
  const type: SavedViewType = VIEW_TYPES.includes(req.body.type) ? req.body.type : 'table';

  const last = await prisma.databaseSavedView.findFirst({ where: { databaseId: db.id }, orderBy: { position: 'desc' }, select: { position: true } });
  const created = await prisma.databaseSavedView.create({
    data: { databaseId: db.id, name, type, position: (last?.position ?? -1) + 1 },
  });
  res.json(serializeSavedView(created));
});

// ===== تعديل View (اسمه، نوعه، خاصية التجميع/التاريخ، فلاتر/ترتيب) =====
router.patch('/:id/views/:viewId', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! }, include: PROPERTIES_INCLUDE });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const view = await prisma.databaseSavedView.findFirst({ where: { id: req.params.viewId, databaseId: db.id } });
  if (!view) return res.status(404).json({ error: 'الـ View غير موجود' });

  let name: string | undefined;
  let filters: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  let sorts: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  try {
    if (req.body.name !== undefined) name = validateName(req.body.name, MAX_VIEW_NAME_LEN, 'اسم الـ View');
    if (req.body.filters !== undefined) filters = validateFiltersAndSorts(req.body.filters, 'الفلاتر');
    if (req.body.sorts !== undefined) sorts = validateFiltersAndSorts(req.body.sorts, 'قواعد الترتيب');
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  let type: SavedViewType | undefined;
  if (req.body.type !== undefined) {
    if (!VIEW_TYPES.includes(req.body.type)) return res.status(400).json({ error: 'نوع عرض غير مدعوم' });
    type = req.body.type;
  }

  let boardGroupById: string | null | undefined;
  if (req.body.boardGroupById !== undefined) {
    boardGroupById = req.body.boardGroupById || null;
    if (boardGroupById) {
      const property = db.properties.find((p) => p.id === boardGroupById);
      if (!property || property.type !== 'select') {
        return res.status(400).json({ error: 'التجميع في عرض الكانبان بيشتغل بخاصية من نوع اختيار واحد بس' });
      }
    }
  }

  let calendarDateById: string | null | undefined;
  if (req.body.calendarDateById !== undefined) {
    calendarDateById = req.body.calendarDateById || null;
    if (calendarDateById) {
      const property = db.properties.find((p) => p.id === calendarDateById);
      if (!property || property.type !== 'date') {
        return res.status(400).json({ error: 'عرض التقويم بيشتغل بخاصية من نوع تاريخ بس' });
      }
    }
  }

  const updated = await prisma.databaseSavedView.update({
    where: { id: view.id },
    data: { name, type, boardGroupById, calendarDateById, filters, sorts },
  });
  res.json(serializeSavedView(updated));
});

// ===== حذف View — لازم يفضل View واحد على الأقل للقاعدة =====
router.delete('/:id/views/:viewId', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const view = await prisma.databaseSavedView.findFirst({ where: { id: req.params.viewId, databaseId: db.id } });
  if (!view) return res.status(404).json({ error: 'الـ View غير موجود' });

  const count = await prisma.databaseSavedView.count({ where: { databaseId: db.id } });
  if (count <= 1) return res.status(400).json({ error: 'لازم يفضل View واحد على الأقل' });

  await prisma.databaseSavedView.delete({ where: { id: view.id } });
  res.json({ success: true });
});

// ===== إعادة ترتيب الـ Views =====
router.post('/:id/views/reorder', async (req: AuthRequest, res) => {
  const db = await prisma.customDatabase.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!db) return res.status(404).json({ error: 'القاعدة غير موجودة' });
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ترتيب غير صحيح' });
  }
  const owned = await prisma.databaseSavedView.findMany({ where: { databaseId: db.id, id: { in: orderedIds } }, select: { id: true } });
  if (owned.length !== orderedIds.length) return res.status(400).json({ error: 'فيه View غير موجود ضمن القاعدة' });

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) => prisma.databaseSavedView.update({ where: { id }, data: { position: index } }))
  );
  res.json({ success: true });
});

export default router;
