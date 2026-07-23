import { prisma } from './prisma';

// ===== تجميع هدف معيّن مع كل الأهداف الفرعية التابعة له (كل المستويات) =====
// بيبدأ من الهدف نفسه (rootId) وينزل بالعرض (BFS) عبر parentGoalId لحد ما
// يجمع كل الأهداف الفرعية التابعة على كل المستويات — لو الهدف سنوي هيجمع
// معاه أي أهداف شهرية/أسبوعية/يومية مرتبطة بيه، لو شهري هيجمع الأسبوعية
// واليومية بس، وهكذا. بيتجاهل حالة الأرشفة/الإنجاز تمامًا لأن "حذف الهدف
// بكل تبعياته" المفروض يمسح *كل* حاجة تحته بغض النظر عن حالتها. الفلترة
// بـ userId في كل خطوة عشان نضمن إننا منجمعش/نحذفش أي حاجة مش ملك المستخدم
// نفسه حتى لو حصل تلاعب في الـ IDs.
export async function collectGoalAndDescendantIds(userId: string, rootId: string): Promise<string[]> {
  const collected = new Set<string>([rootId]);
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await prisma.todoList.findMany({
      where: { userId, parentGoalId: { in: frontier } },
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
