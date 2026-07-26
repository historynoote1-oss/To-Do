// ===== طبقة الـ API =====
// الملف ده بقى "واجهة" بس (barrel) — الكود الفعلي اتقسّم حسب الدومين جوه
// مجلد services/api/ (كل دومين في ملفه: auth, lists, items, reminders,
// admin/*...) عشان محدش يفضل يفتح ملف واحد طوله 1100 سطر لأي تعديل بسيط.
// بنسيب الاستيراد من '@/services/api' شغال زي ما هو في كل الصفحات القديمة
// (25 ملف بيستوردوا منه) من غير ما نحتاج نلمسهم.

export * from './api/core';
export * from './api/auth';
export * from './api/media';
export * from './api/lists';
export * from './api/trash';
export * from './api/lifeAreas';
export * from './api/items';
export * from './api/reminders';
export * from './api/push';
export * from './api/streak';
export * from './api/notifications';
export * from './api/profile';
export * from './api/site';
export * from './api/admin/stats';
export * from './api/admin/users';
export * from './api/admin/analytics';
export * from './api/admin/content';
export * from './api/admin/settings';
export * from './api/admin/voiceRooms';
export * from './api/voiceRooms';
