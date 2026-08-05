// نقطة تجميع مركزية لأنواع (types) المشروع المشتركة — بدل ما كل ملف يستورد
// النوع من مكان تاني متفرق، ده بيدّي مكان واحد واضح لأي حد جديد يلاقي فيه
// الأنواع الأساسية للتطبيق. الأنواع نفسها لسه معرّفة جوه ملفاتها الأصلية
// (عشان تفضل جنب المنطق اللي بيستخدمها)، والملف ده بس بيعيد تصديرها.

export type { Reminder, SiteStatus } from '@/services/api';
export type { ViewName } from '@/services/routes';
export type { AdminTab } from '@/pages/admin/AdminDashboard';
export { type LifeAreaData } from '@/utils/lifeArea';
export type { YoutubeTrack } from '@/hooks/musicPlayer';
export type { UndoableCommand } from '@/hooks/undoRedo';
