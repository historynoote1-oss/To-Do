import { prisma } from '../core/prisma';

const CHECK_INTERVAL_MS = 30 * 1000;

// المهلة الإضافية بعد موعد نهاية المهمة (endTime) قبل ما تتعتبر "متأخرة".
// السلوك بعد المهلة دي بيختلف حسب نوع المهمة (شوف tick() تحت):
// - مهمة عادية (category = null) => بتتنقل تلقائيًا لتبويب "المهام
//   المتأخرة" في الأرشيف (زي ما كان دايمًا).
// - هدف/مهمة من خريطة الأهداف (category محدد) => بتفضل في مكانها، بس
//   بتتعلّم كـ"متأخرة" (overduePenalizedAt) وبيتخصم منها يوم استريك واحد
//   (خريطة الأهداف، المرحلة 7 — شوف تعليق overduePenalizedAt في schema.prisma).
export const OVERDUE_GRACE_MINUTES = 10;

// بيفحص كل شوية أي مهمة رئيسية عادية نشطة (مش مؤرشفة، ومش بانتظار مراجعة
// استرجاع، ومش من خريطة الأهداف) ليها وقت نهاية محدد (endTime — شوف
// "مؤقت المهمة الرئيسية" في schema.prisma) وعدّى موعدها بأكتر من
// OVERDUE_GRACE_MINUTES دقيقة من غير ما المستخدم يخلّصها (أرشفة عادية
// بتحصل بس لو أكّد الإنجاز — شوف lib/archive.ts). المهام دي بتتأرشف
// تلقائيًا بسبب OVERDUE، وده بيفرقها نهائيًا عن الأرشفة العادية: مش قابلة
// للاسترجاع ولا الحذف (شوف الحواجز في routes/lists.ts وroutes/items.ts).
async function tickRegularTasks(cutoff: Date) {
  const overdueLists = await prisma.todoList.findMany({
    where: {
      category: null,
      archivedAt: null,
      pendingRestoreAt: null,
      trashedAt: null,
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

// نفس فكرة tickRegularTasks بالظبط، لكن لأهداف/مهام خريطة الأهداف (category
// محدد). هنا الهدف مبيتؤرشفش ولا يتحرّك من مكانه — بيتحط عليه بس علامة
// overduePenalizedAt (عشان يظهر بشكل لافت أعلى صفحة خريطة الأهداف ويقدر
// المستخدم يراجعه ويعدّله من نفس المكان)، ويتخصم يوم استريك واحد فوري من
// صاحبه (User.streakPenalty، مسموح يبقى بالسالب — شوف routes/streak.ts).
// الفلتر بـ overduePenalizedAt: null بيمنع تكرار الخصم لنفس الهدف كل ما
// الجدولة تشتغل.
async function tickGoalHierarchyItems(cutoff: Date) {
  const overdueGoals = await prisma.todoList.findMany({
    where: {
      category: { not: null },
      confirmedDone: false,
      pendingRestoreAt: null,
      trashedAt: null,
      overduePenalizedAt: null,
      endTime: { not: null, lte: cutoff },
    },
    select: { id: true, userId: true },
    take: 500,
  });

  if (overdueGoals.length === 0) return;

  const now = new Date();

  // بنعمل تحديث + خصم استريك سطر بسطر جوه transaction واحدة (بدل
  // updateMany) عشان كل هدف محتاج يزوّد streakPenalty بتاع صاحبه بـ 1 —
  // عملية "زيادة" لازم تتعمل لكل صف لوحده، مش ممكنة بـ updateMany جماعي.
  await prisma.$transaction(
    overdueGoals.flatMap((g) => [
      prisma.todoList.update({ where: { id: g.id }, data: { overduePenalizedAt: now } }),
      prisma.user.update({ where: { id: g.userId }, data: { streakPenalty: { increment: 1 } } }),
    ])
  );
}

async function tick() {
  const cutoff = new Date(Date.now() - OVERDUE_GRACE_MINUTES * 60 * 1000);
  await tickRegularTasks(cutoff);
  await tickGoalHierarchyItems(cutoff);
}

let started = false;

export function startOverdueScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    tick().catch((err) => console.error('خطأ في جدولة أرشفة/تأخير المهام:', err));
  }, CHECK_INTERVAL_MS);
  console.log('⏰ جدولة الأرشفة/تأخير المهام التلقائية شغالة');
}
