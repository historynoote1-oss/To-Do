import { prisma } from './prisma';

// عدد أيام الاحتفاظ بسنة محذوفة في سلة المحذوفات قبل الحذف النهائي التلقائي.
export const TRASH_RETENTION_DAYS = 5;

// ===== تجميع كل الأهداف تحت سنة معيّنة (كل المستويات) =====
// بيبدأ من الأهداف السنوية (targetYear = year) وينزل بالعرض (BFS) عبر
// parentGoalId لحد ما يجمع كل الأهداف الفرعية على كل المستويات، بغض النظر
// عن حالة الأرشفة بتاعتها (نشطة أو مؤرشفة) — لأن "حذف السنة" المفروض
// يمسح *كل* محتواها فعلاً. بيتجاهل أي هدف متحذوف بالفعل (trashedAt موجود)
// عشان ميحاولش يحذفه تاني.
async function collectYearGoalIds(userId: string, year: number): Promise<string[]> {
  const rootGoals = await prisma.todoList.findMany({
    where: { userId, category: 'YEARLY', targetYear: year, trashedAt: null },
    select: { id: true },
  });

  const collected = new Set<string>(rootGoals.map((g) => g.id));
  let frontier = Array.from(collected);

  while (frontier.length > 0) {
    const children = await prisma.todoList.findMany({
      where: { userId, parentGoalId: { in: frontier }, trashedAt: null },
      select: { id: true },
    });
    frontier = [];
    for (const child of children) {
      if (!collected.has(child.id)) {
        collected.add(child.id);
        frontier.push(child.id);
      }
    }
  }

  return Array.from(collected);
}

// بينقل سنة كاملة (بكل محتواها على كل المستويات) لسلة المحذوفات المؤقتة.
// بيرجّع عدد الأهداف اللي اتنقلت، أو 0 لو السنة مفيهاش أي هدف سنوي أصلًا
// (يعني تبويب فاضي لسه محفوظ محليًا في الواجهة بس مفيهوش أي بيانات فعلية
// في قاعدة البيانات لحد دلوقتي).
export async function trashYear(userId: string, year: number): Promise<number> {
  const ids = await collectYearGoalIds(userId, year);
  if (ids.length === 0) return 0;

  const now = new Date();
  await prisma.todoList.updateMany({
    where: { id: { in: ids } },
    data: { trashedAt: now, trashedYear: year },
  });
  return ids.length;
}

// بيسترجع سنة كاملة من سلة المحذوفات — كل حاجة بترجع بالظبط لحالتها الأصلية
// (بما فيها الأرشفة لو كانت مؤرشفة قبل الحذف، لأننا مبنلمسش archivedAt هنا خالص).
export async function restoreYear(userId: string, year: number): Promise<number> {
  const result = await prisma.todoList.updateMany({
    where: { userId, trashedYear: year, trashedAt: { not: null } },
    data: { trashedAt: null, trashedYear: null },
  });
  return result.count;
}
