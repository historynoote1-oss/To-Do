import { prisma } from './prisma';

const CHECK_INTERVAL_MS = 30 * 1000;

// المهلة الإضافية بعد موعد نهاية المهمة (endTime) قبل ما تتعتبر "متأخرة"
// وتتنقل تلقائيًا لتبويب "المهام المتأخرة" في الأرشيف.
export const OVERDUE_GRACE_MINUTES = 10;

// بيفحص كل شوية أي مهمة رئيسية نشطة (مش مؤرشفة، ومش بانتظار مراجعة استرجاع)
// ليها وقت نهاية محدد (endTime — شوف "مؤقت المهمة الرئيسية" في schema.prisma)
// وعدّى موعدها بأكتر من OVERDUE_GRACE_MINUTES دقيقة من غير ما المستخدم يخلّصها
// (أرشفة عادية بتحصل بس لو أكّد الإنجاز — شوف lib/archive.ts). المهام دي
// بتتأرشف تلقائيًا بسبب OVERDUE، وده بيفرقها نهائيًا عن الأرشفة العادية:
// مش قابلة للاسترجاع ولا الحذف (شوف الحواجز في routes/lists.ts وroutes/items.ts).
async function tick() {
  const cutoff = new Date(Date.now() - OVERDUE_GRACE_MINUTES * 60 * 1000);

  const overdueLists = await prisma.todoList.findMany({
    where: {
      archivedAt: null,
      pendingRestoreAt: null,
      endTime: { not: null, lte: cutoff },
    },
    select: { id: true },
    take: 500,
  });

  if (overdueLists.length === 0) return;

  const now = new Date();
  await prisma.todoList.updateMany({
    where: { id: { in: overdueLists.map((l) => l.id) } },
    data: {
      archivedAt: now,
      archiveReason: 'OVERDUE',
      // التأكيد النهائي مالوش معنى لمهمة اتؤرشفت بسبب التأخير، مش الإنجاز.
      confirmedDone: false,
    },
  });
}

let started = false;

export function startOverdueScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    tick().catch((err) => console.error('خطأ في جدولة أرشفة المهام المتأخرة:', err));
  }, CHECK_INTERVAL_MS);
  console.log('⏰ جدولة الأرشفة التلقائية للمهام المتأخرة شغالة');
}
