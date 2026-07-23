import { prisma } from '../lib/core/prisma';

// سكريبت بيتشغل يدوي بس من Railway Shell، مفيش أي طريقة تانية تحوّل حساب لأدمن
// (مفيش زرار أو API endpoint عام لكده) — ده مقصود عشان محدش يقدر يعمل نفسه أدمن
// غير الشخص اللي عنده وصول فعلي لسيرفر الباك إند نفسه.
async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('استخدم: node dist/scripts/makeAdmin.js USERNAME');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { username },
    data: { isAdmin: true },
  });

  console.log(`✅ الحساب "${user.username}" بقى أدمن دلوقتي.`);
}

main()
  .catch((err) => {
    console.error('❌ حصل خطأ:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
