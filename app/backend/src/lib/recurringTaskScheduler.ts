import { Prisma, RecurringTask, RecurringTaskItem } from '@prisma/client';
import { prisma } from './prisma';
import { addRecurrenceInterval, buildOccurrenceTitle, fastForward, RecurrenceFrequency } from './recurrence';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // كل 5 دقائق — التكرارات دورية بطبيعتها، مش محتاجة دقة الثواني بتاعة التذكيرات
const MAX_TITLE_RETRIES = 5;

type RecurringTaskWithItems = RecurringTask & { items: RecurringTaskItem[] };

// بتحوّل قالب مهمة متكررة لنسخة (TodoList) فعلية جديدة، وبتنسخلها كل مهامها
// الفرعية من القالب. category بتاخد نفس قيمة frequency مباشرة (نفس أسماء
// enum بالظبط) عشان النسخة الجديدة تظهر منظمة تحت قسمها الصح (يومية/أسبوعية/
// شهرية/سنوية) زي أي مهمة تانية في الواجهة الرئيسية من غير أي خطوة إضافية.
export async function generateOccurrence(task: RecurringTaskWithItems, occurrenceDate: Date) {
  const frequency = task.frequency as RecurrenceFrequency;
  const baseTitle = buildOccurrenceTitle(task.title, frequency, occurrenceDate);

  for (let attempt = 0; attempt < MAX_TITLE_RETRIES; attempt += 1) {
    const title = attempt === 0 ? baseTitle : `${baseTitle} (${attempt + 1})`;
    try {
      return await prisma.todoList.create({
        data: {
          userId: task.userId,
          title,
          priority: task.priority,
          category: frequency,
          targetYear: frequency === 'YEARLY' ? occurrenceDate.getFullYear() : undefined,
          lifeAreaId: task.lifeAreaId ?? undefined,
          recurringTaskId: task.id,
          occurrenceDate,
          items: {
            create: task.items.map((item) => ({
              content: item.content,
              priority: item.priority,
              position: item.position,
            })),
          },
        },
        include: { lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true } } },
      });
    } catch (err) {
      // فيه احتمال (نادر) إن نفس العنوان يكون موجود بالفعل (userId+title
      // فريد) — لو كذلك، بنجرّب عنوان مختلف شوية بدل ما نفشل التوليد كله.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < MAX_TITLE_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function tick() {
  const now = new Date();

  const due = await prisma.recurringTask.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { items: { orderBy: { position: 'asc' } } },
    take: 200,
  });

  if (due.length === 0) return;

  for (const task of due) {
    try {
      const occurrenceDate = task.nextRunAt;
      const frequency = task.frequency as RecurrenceFrequency;
      const advanced = addRecurrenceInterval(occurrenceDate, frequency, task.interval);
      // لو السيرفر كان واقف فترة طويلة، منولّدش كل الدورات الفايتة — نولّد
      // النسخة الحالية بس، ونقفز مباشرة لأقرب دورة جاية حقيقية بعد النهاردة.
      const nextRunAt = fastForward(advanced, frequency, task.interval, now);

      await generateOccurrence(task, occurrenceDate);
      await prisma.recurringTask.update({
        where: { id: task.id },
        data: { nextRunAt, lastGeneratedAt: now },
      });
    } catch (err) {
      console.error(`فشل توليد نسخة من المهمة المتكررة ${task.id}:`, err);
    }
  }
}

let started = false;

export function startRecurringTaskScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    tick().catch((err) => console.error('خطأ في جدولة المهام المتكررة:', err));
  }, CHECK_INTERVAL_MS);
  // فحص أول مرة بعد دقيقة من إقلاع السيرفر (مش فورًا) عشان نديله فرصة يخلّص
  // إعداد باقي الاتصالات الأول.
  setTimeout(() => {
    tick().catch((err) => console.error('خطأ في جدولة المهام المتكررة:', err));
  }, 60 * 1000);
  console.log('🔁 جدولة المهام المتكررة شغالة');
}
