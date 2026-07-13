import { prisma } from './prisma';

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
export async function syncListArchiveState(listId: string) {
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

  const total = list.items.length;
  const done = list.items.filter((i) => i.isDone).length;
  const allSubtasksDone = total > 0 && done === total;
  const isComplete = allSubtasksDone && list.confirmedDone;

  const data: { archivedAt?: Date | null; confirmedDone?: boolean } = {};

  // التأكيد النهائي مالوش معنى غير لو كل المهام الفرعية منجزة فعلاً. أي
  // رجوع لمهمة فرعية غير منجزة (أو إضافة واحدة جديدة) بيصفّر التأكيد
  // تلقائيًا عشان المستخدم يضطر يأكّد تاني بعد ما يخلص فعلاً.
  if (!allSubtasksDone && list.confirmedDone) {
    data.confirmedDone = false;
  }

  if (isComplete && !list.archivedAt) {
    data.archivedAt = new Date();
  } else if (!isComplete && list.archivedAt) {
    data.archivedAt = null;
  }

  if (Object.keys(data).length === 0) return null;
  return prisma.todoList.update({ where: { id: listId }, data });
}
