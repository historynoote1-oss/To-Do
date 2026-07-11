import { prisma } from '../lib/prisma';

// ============================================================================
// سكريبت هجرة يُشغَّل مرة واحدة (من Railway Shell) بعد نشر النظام الجديد.
//
// أي حساب اتسجّل بالنظام القديم معندوش email خالص (الحقل كان مش موجود أصلًا).
// أي حساب جديد من دلوقتي لازم يبقى معاه email من لحظة التسجيل (شوف routes/auth.ts).
// يبقى ببساطة: كل حساب email = NULL دلوقتي هو حساب قديم محتاج إعادة تأهيل —
// مفيش داعي لسرد أسماء المستخدمين الـ 8 يدويًا، السكريبت بيكتشفهم تلقائيًا
// وبيفضل آمن حتى لو الشغل اتشغل أكتر من مرة بالغلط (idempotent).
//
// الاستخدام:
//   node dist/scripts/markLegacyAccounts.js            -> يعالج كل الحسابات معندهاش إيميل
//   node dist/scripts/markLegacyAccounts.js user1 user2 -> يعالج أسماء مستخدمين محددين بس
//                                                           (حتى لو عندهم إيميل بالفعل، للطوارئ)
// ============================================================================
async function main() {
  const specificUsernames = process.argv.slice(2);

  const targets =
    specificUsernames.length > 0
      ? await prisma.user.findMany({ where: { username: { in: specificUsernames } } })
      : await prisma.user.findMany({ where: { email: null, mustRehabilitate: false } });

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
