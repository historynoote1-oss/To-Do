import { prisma } from './prisma';
import { TRASH_RETENTION_DAYS } from './trash';

// بنفحص كل ساعة (مش محتاجين دقة عالية زي المهام المتأخرة) أي هدف في سلة
// المحذوفات عدّى على حذفه 5 أيام كاملة، ونحذفه نهائيًا من قاعدة البيانات —
// لا رجعة بعد كده. الحذف بيتم على مستوى الهدف نفسه (مش السنة كلها دفعة
// واحدة) عشان لو حصل أي فرق توقيت بسيط بين أهداف نفس الدفعة يتصرف صح.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function tick() {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expired = await prisma.todoList.findMany({
    where: { trashedAt: { not: null, lte: cutoff } },
    select: { id: true },
    take: 1000,
  });

  if (expired.length === 0) return;

  await prisma.todoList.deleteMany({ where: { id: { in: expired.map((g) => g.id) } } });
  console.log(`🗑️ الحذف النهائي التلقائي: ${expired.length} هدف عدّى عليه ${TRASH_RETENTION_DAYS} أيام في سلة المحذوفات`);
}

let started = false;

export function startTrashScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    tick().catch((err) => console.error('خطأ في جدولة الحذف النهائي لسلة المحذوفات:', err));
  }, CHECK_INTERVAL_MS);
  // فحص أول مرة فورًا عند تشغيل السيرفر كمان، مش بس بعد أول ساعة.
  tick().catch((err) => console.error('خطأ في جدولة الحذف النهائي لسلة المحذوفات:', err));
  console.log('⏰ جدولة الحذف النهائي التلقائي لسلة المحذوفات شغالة');
}
