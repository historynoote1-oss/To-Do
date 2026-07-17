import { prisma } from './prisma';
import { utcDayFrom } from './localDate';

// بيفحص حالة اكتمال مهمة رئيسية وبيزامن حالة الأرشفة بتاعتها تلقائيًا معاها.
//
// مهم: اكتمال كل المهام الفرعية (isDone = true للكل) لوحده مش كافي عشان
// المهمة الرئيسية تتؤرشف. لازم كمان المستخدم يكون أكّد بنفسه على مربع
// الإنجاز النهائي في الكارت (confirmedDone = true) — شوف routes/lists.ts
// (POST /:id/confirm-done). المزامنة هنا بتشتغل كالتالي:
//
// - كل المهام الفرعية منجزة + المستخدم أكّد (confirmedDone) + لسه مش
//   مؤرشفة  => تتؤرشف تلقائيًا (archivedAt = دلوقتي).
// - بقت غير مكتملة (رجّع المستخدم مهمة فرعية، أو ضاف واحدة جديدة، أو حذف
//   واحدة منجزة) => بيتصفّر التأكيد تلقائيًا (confirmedDone = false)، ولو
//   كانت مؤرشفة بترجع تلقائيًا للقائمة النشطة (archivedAt = null).
//
// بيتنادى بعد أي عملية ممكن تغيّر عدد/حالة المهام الفرعية (إضافة، حذف،
// تبديل الإنجاز) أو حالة التأكيد نفسها. بيرجع المهمة الرئيسية بعد التحديث
// لو حصل تغيير، أو null لو محصلش أي تغيير.
//
// localDay (اختياري): اليوم المحلي بتاع المستخدم (من routes/lists.ts، مبعوت
// من الفرونت) — لو موجود بيتسجّل عليه يوم الإنجاز في UserActivityDay بدل ما
// يتحسب من وقت السيرفر UTC، عشان الاستريك يفضل مضبوط لأي توقيت.
export async function syncListArchiveState(listId: string, localDay?: Date) {
  const list = await prisma.todoList.findUnique({
    where: { id: listId },
    include: { items: { select: { isDone: true } } },
  });
  if (!list) return null;

  // مهمة "بانتظار المراجعة" (استُرجعت من الأرشيف ولسه محتاجة تأكيد المستخدم)
  // بنستثنيها تمامًا من المزامنة التلقائية — لو سبناها تشتغل عادي، أي تعديل
  // فيها وكل مهامها الفرعية لسه منجزة هيرجعها فورًا للأرشيف تاني قبل ما
  // المستخدم يقدر يراجعها ويأكّد استرجاعها. شوف routes/lists.ts.
  if (list.pendingRestoreAt) return null;

  // مهمة اتؤرشفت تلقائيًا لأنها "فاتت معادها" (تبويب "المهام المتأخرة") لازم
  // تفضل مجمّدة نهائيًا — أي تعديل لاحق في مهامها الفرعية (حتى لو رجعت كلها
  // منجزة) ميرجعهاش للقائمة النشطة ولا يغيّر حالتها؛ الاسترجاع والحذف
  // بالنسبة لها ممنوعين تمامًا (شوف routes/lists.ts وroutes/items.ts).
  if (list.archiveReason === 'OVERDUE') return null;

  const total = list.items.length;
  const done = list.items.filter((i) => i.isDone).length;
  const allSubtasksDone = total > 0 && done === total;
  const isComplete = allSubtasksDone && list.confirmedDone;

  const data: { archivedAt?: Date | null; confirmedDone?: boolean; archiveReason?: 'COMPLETED' } = {};

  // التأكيد النهائي مالوش معنى غير لو كل المهام الفرعية منجزة فعلاً. أي
  // رجوع لمهمة فرعية غير منجزة (أو إضافة واحدة جديدة) بيصفّر التأكيد
  // تلقائيًا عشان المستخدم يضطر يأكّد تاني بعد ما يخلص فعلاً.
  if (!allSubtasksDone && list.confirmedDone) {
    data.confirmedDone = false;
  }

  if (isComplete && !list.archivedAt) {
    data.archivedAt = new Date();
    data.archiveReason = 'COMPLETED';
  } else if (!isComplete && list.archivedAt) {
    data.archivedAt = null;
  }

  if (Object.keys(data).length === 0) return null;
  const updated = await prisma.todoList.update({ where: { id: listId }, data });

  // تسجيل يوم الإنجاز للاستريك: أول ما مهمة رئيسية تتؤرشف فعليًا (تكتمل)،
  // بنسجّل "اليوم ده فيه إنجاز" لصاحبها. upsert عشان تكرار نفس اليوم (لو
  // المستخدم خلّص أكتر من مهمة رئيسية في نفس اليوم) ميعملش تعارض.
  if (data.archivedAt) {
    const completedAt = data.archivedAt;
    const day = localDay ?? utcDayFrom(completedAt);
    await prisma.userActivityDay
      .upsert({
        where: { userId_date: { userId: list.userId, date: day } },
        update: {},
        create: { userId: list.userId, date: day },
      })
      .catch(() => {
        // فشل تسجيل الاستريك مش سبب كافي نفشل عملية الأرشفة نفسها
      });
  }

  return updated;
}
