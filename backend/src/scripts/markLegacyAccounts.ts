import { prisma } from '../lib/core/prisma';

// ============================================================================
// سكريبت اختياري (مش لازم تشغّله خالص) — /auth/login بقى بيكتشف الحسابات
// القديمة تلقائيًا أول ما صاحبها يجرب يسجّل دخول (شوف routes/auth.ts)، فمفيش
// أي حاجة يدوية مطلوبة عشان إعادة التأهيل تشتغل.
//
// الاستخدام الوحيد لسكريبت زي ده: لو عايز "تعلّم" كل الحسابات القديمة وتلغي
// جلساتهم فورًا مرة واحدة (بدل ما تستنى كل واحد يفتح الموقع بنفسه)، مثلاً
// عشان تتابعهم من لوحة التحكم قبل ما حد منهم يسجّل دخول أصلًا.
//
// الاستخدام:
//   node dist/scripts/markLegacyAccounts.js            -> يعالج كل الحسابات اللي مالهاش كود استرجاع
//   node dist/scripts/markLegacyAccounts.js user1 user2 -> يعالج أسماء مستخدمين محددين بس
// ============================================================================
async function main() {
  const specificUsernames = process.argv.slice(2);

  const targets =
    specificUsernames.length > 0
      ? await prisma.user.findMany({ where: { username: { in: specificUsernames } } })
      : await prisma.user.findMany({ where: { recoveryCodeHash: null, mustRehabilitate: false } });

  if (targets.length === 0) {
    console.log('مفيش أي حسابات قديمة محتاجة إعادة تأهيل حاليًا. تمام ✅');
    return;
  }

  console.log(`هيتم تعليم ${targets.length} حساب لإعادة التأهيل الإجبارية:`);
  targets.forEach((u) => console.log(`  - ${u.username} (${u.id})`));

  // tokenVersion++ بيلغي فورًا أي جلسة/توكن قديم شغال لحد المستخدمين دول،
  // فحتى لو حد فاتح الموقع دلوقتي بجلسة قديمة، هيتسجّل خروج تلقائيًا ويضطر
  // يسجل دخول من الأول ويعدي بمسار إعادة التأهيل.
  const result = await prisma.user.updateMany({
    where: { id: { in: targets.map((u) => u.id) } },
    data: {
      legacyAccount: true,
      mustRehabilitate: true,
      tokenVersion: { increment: 1 },
    },
  });

  console.log(`✅ تم تعليم ${result.count} حساب. بياناتهم (القوائم والمهام) متلمسش خالص.`);
  console.log('أول ما أي واحد فيهم يجرب يسجل دخول بيوزره وباسوردة القديمين، هيتوجه تلقائيًا لصفحة إعادة التأهيل.');
}

main()
  .catch((err) => {
    console.error('❌ حصل خطأ:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
