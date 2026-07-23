# هيكلة المشروع (بعد التنظيم)

تم إعادة تنظيم كل ملفات الفرونت والباك اند اللي كانت متبعثرة في مجلدين مسطّحين
(`components/` و `lib/`) إلى مجلدات فرعية حسب الوظيفة، مع تصحيح كل الـ imports
تلقائيًا والتأكد إنها بتتحلّ صح (تم التحقق بـ `tsc --noEmit` على المشروعين).

## Frontend (`frontend/src`)

```
src/
├── App.tsx, main.tsx, styles.css, vite-env.d.ts   ← ثابتين في الجذر
├── components/
│   ├── admin/          لوحة تحكم الأدمن (Dashboard, Analytics, Users, Content, Settings, Overview, ConfirmModal)
│   ├── auth/            تسجيل الدخول/التسجيل، 2FA، استرجاع الحساب
│   ├── tasks/            المهام: قوائم، عناصر، أرشيف، هرمية، تايم لاين، تكرار
│   ├── life-areas/       مجالات الحياة، الفئات، الأولويات
│   ├── goals/            خريطة الأهداف
│   ├── stats/            بطاقات الإحصائيات
│   ├── media/            مشغل الموسيقى، البومودورو
│   ├── prayer/           أوقات الصلاة والأذونات الأصلية
│   ├── notifications/    جرس الإشعارات، مودال التذكيرات
│   ├── layout/           عناصر الواجهة العامة (SideMenu, BottomTabBar, ThemeToggle...)
│   ├── common/           مكونات مشتركة عامة (Portal, ConfirmModal)
│   └── profile/          صفحة البروفايل
└── lib/
    ├── api/              اتصال الـ API والـ routes
    ├── audio/            الصوتيات (أذان، أصوات، موسيقى، بومودورو)
    ├── prayer/           منطق حساب أوقات الصلاة
    ├── notifications/    الإشعارات الأصلية والـ push
    └── core/             أدوات عامة (theme, toast, undoRedo, icons, organize...)
```

الـ imports كلها بقت بتستخدم alias موحّد `@/...` بدل المسارات النسبية
(`../../lib/...`)، ده متظبط في:
- `vite.config.ts` عن طريق `resolve.alias`
- `tsconfig.json` عن طريق `paths` (للـ IDE و type-checking)

## Backend (`backend/src`)

كانت منظمة أصلاً (`routes/`, `middleware/`, `scripts/`)، اللي كان متبعثر هو
مجلد `lib/` (16 ملف مسطّح)، فاتقسّم لـ:

```
src/lib/
├── auth/         auth.ts, twoFactor.ts
├── uploads/      avatarUpload.ts, lifeAreaUpload.ts
├── schedulers/   overdueScheduler, recurringTaskScheduler, reminderScheduler, trashScheduler
└── core/         archive, goalCascade, localDate, prisma, push, recurrence, siteSettings, trash
```

الباك اند شغال بـ `tsx`/`tsc` عادي من غير باندلر، فاستخدمت مسارات نسبية
(`../../`) مُعاد حسابها تلقائيًا بدل الـ alias (عشان الـ alias هناك محتاج
باكدج زيادة زي `tsconfig-paths` مش موجودة في `package.json`).

## الجذر

- `docs/` — اتنقل له ملفات التوثيق العربي اللي كانت في الجذر (فيه ملفين
  متشابهين جدًا، الفرق بينهم في تحديث حالة "الإشعارات الأصلية" — يفضّل
  تراجع الاتنين وتمسح الأقدم لو مش محتاجه).
