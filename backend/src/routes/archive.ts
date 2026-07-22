import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';

const router = Router();

// بترجع كل المهام الرئيسية المؤرشفة بتاعة المستخدم (بنفس تركيب GET
// /api/lists تقريبًا، عشان تقدر تعيد استخدام نفس مكوّنات العرض في
// الواجهة). الفرز بالأحدث أرشفة الأول، والتجميع حسب السنة/الشهر/اليوم/
// التصنيف بيتم في الواجهة نفسها من archivedAt وcategory بتاعة كل مهمة.
router.get('/', async (req: AuthRequest, res) => {
  const archived = await prisma.todoList.findMany({
    where: { userId: req.userId!, archivedAt: { not: null }, trashedAt: null },
    include: {
      items: { orderBy: { position: 'asc' } },
      lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } },
    },
    orderBy: { archivedAt: 'desc' },
  });
  res.json(archived);
});

export default router;
