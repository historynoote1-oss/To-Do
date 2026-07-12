import { prisma } from './prisma';

// بيفحص حالة اكتمال مهمة رئيسية (كل مهامها الفرعية منجزة، وفيه مهمة فرعية
// واحدة على الأقل) وبيزامن حالة الأرشفة بتاعتها تلقائيًا مع الحالة دي:
//
// - اكتملت ولسه مش مؤرشفة  => تتؤرشف تلقائيًا (archivedAt = دلوقتي).
// - بقت غير مكتملة (رجّع المستخدم مهمة فرعية، أو ضاف واحدة جديدة، أو حذف
//   واحدة منجزة) وكانت مؤرشفة => بترجع تلقائيًا للقائمة النشطة (archivedAt = null).
//
// بيتنادى بعد أي عملية ممكن تغيّر عدد/حالة المهام الفرعية (إضافة، حذف،
// تبديل الإنجاز). بيرجع المهمة الرئيسية بعد التحديث لو حصل تغيير في حالة
// الأرشفة، أو null لو محصلش أي تغيير.
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
  const isComplete = total > 0 && done === total;

  if (isComplete && !list.archivedAt) {
    return prisma.todoList.update({ where: { id: listId }, data: { archivedAt: new Date() } });
  }
  if (!isComplete && list.archivedAt) {
    return prisma.todoList.update({ where: { id: listId }, data: { archivedAt: null } });
  }
  return null;
}
