import { useEffect, useRef, useState } from 'react';
import {
  getLists,
  createList,
  deleteList,
  addItem,
  toggleItem,
  createReminder,
  getSiteStatus,
  getProfile,
  resolveAvatarUrl,
  getDueReminders,
  getLifeAreas,
  getArchive,
  getPendingRestoreLists,
  finalizeRestore,
  MaintenanceError,
  resetSessionExpiredGuard,
  SessionExpiredError,
  SiteStatus,
  Reminder,
} from './lib/api';
import { useUndoRedo } from './lib/undoRedo';
import { sounds } from './lib/sounds';
import { toast } from './lib/toast';
import { getPushState, enablePush, disablePush, PushSupportState, PushError } from './lib/push';
import TodoList from './components/TodoList';
import AuthForm from './components/AuthForm';
import AdminDashboard from './components/AdminDashboard';
import Profile from './components/Profile';
import LifeAreasManager from './components/LifeAreasManager';
import RecurringTasksManager from './components/RecurringTasksManager';
import ArchivePage from './components/Archive';
import MaintenancePage from './components/MaintenancePage';
import ToastContainer from './components/ToastContainer';
import SideMenu from './components/SideMenu';
import ThemeToggleButton from './components/ThemeToggleButton';
import ConfirmModal from './components/ConfirmModal';
import AddTaskModal, { NewTaskPayload } from './components/AddTaskModal';
import { CategoryKey } from './lib/category';
import { LifeAreaData } from './lib/lifeArea';
import { groupByLifeArea, groupHierarchical, urgentLists, isListDone, NO_LIFE_AREA_GROUP } from './lib/organize';
import TaskHierarchy from './components/TaskHierarchy';
import { DynamicIcon } from './lib/icons';
import TaskDistributionCard from './components/TaskDistributionCard';
import CompletionRateCard from './components/CompletionRateCard';
import PendingRestoreSection from './components/PendingRestoreSection';

interface List {
  id: string;
  title: string;
  priority?: string;
  startTime?: string | null;
  endTime?: string | null;
  category?: string | null;
  targetYear?: number | null;
  lifeAreaId?: string | null;
  lifeArea?: { id: string; name: string; color: string; icon: string | null; imageUrl: string | null } | null;
  recurringTaskId?: string | null;
  items: any[];
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('token') ? localStorage.getItem('username') : null
  );
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdmin') === 'true');
  const [view, setView] = useState<'todos' | 'admin' | 'profile' | 'lifeAreas' | 'archive' | 'recurring'>('todos');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [archiveCount, setArchiveCount] = useState<number>(0);
  // مهام استُرجعت من الأرشيف ولسه بانتظار مراجعة المستخدم قبل ما ترجع فعليًا
  // لقائمة المهام النشطة — بتتعرض في قسم مخصص فوق الصفحة الرئيسية (شوف
  // PendingRestoreSection). بنجيبها منفصلة عن `lists` عشان الشاشة الرئيسية
  // تفضل مقتصرة على المهام النشطة فعليًا زي ما كانت دايمًا.
  const [pendingRestoreLists, setPendingRestoreLists] = useState<List[]>([]);
  // منجز/إجمالي المهام الفرعية جوه الأرشيف — بنحسبهم من نفس رد getArchive()
  // (بيرجع القوائم المؤرشفة بتفاصيل مهامها) من غير طلب إضافي للسيرفر، عشان
  // نقدر نحسب نسبة إنجاز شاملة (نشطة + مؤرشفة) في هيدر الصفحة الرئيسية.
  const [archiveStats, setArchiveStats] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [highlightedListId, setHighlightedListId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [pushState, setPushState] = useState<PushSupportState>('unsupported');
  const [lifeAreas, setLifeAreas] = useState<LifeAreaData[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<'overview' | 'analytics' | 'users' | 'content' | 'settings' | 'security'>('overview');
  const shownReminderIds = useRef<Set<string>>(new Set());
  const { canUndo, canRedo, undoLabel, redoLabel, isBusy: undoRedoBusy, pushCommand, undo, redo } = useUndoRedo();

  // زرار الكتم في الهيدر لازم يفضل متزامن حتى لو الكتم اتغيّر من صفحة
  // إعدادات الصوت في البروفايل.
  useEffect(() => {
    return sounds.subscribe(({ muted: m }) => setMuted(m));
  }, []);

  // بيتنادى من أي طلب API فشل بـ 401 (توكن منتهي/باطل — سواء بسبب انتهاء
  // الصلاحية، أو Force Logout من الأدمن، أو تغيير كلمة السر من جهاز تاني).
  // بدل ما نسيب المستخدم واقف قدام شاشة معطوبة بتكرر له أخطاء غامضة على كل
  // حركة، بنرجّعه فورًا لصفحة تسجيل الدخول مع رسالة واضحة.
  useEffect(() => {
    function handleSessionExpired() {
      const wasLoggedIn = !!localStorage.getItem('token');
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('isAdmin');
      setUsername(null);
      setIsAdmin(false);
      setDisplayName(null);
      setAvatarUrl(null);
      setLists([]);
      setLifeAreas([]);
      setView('todos');
      if (wasLoggedIn) {
        sounds.error();
        toast.error('انتهت صلاحية جلستك — سجّل دخول تاني عشان تكمل');
      }
    }
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  // اختصارات لوحة المفاتيح للتراجع/الإعادة: Ctrl/Cmd+Z للتراجع،
  // Ctrl/Cmd+Shift+Z أو Ctrl/Cmd+Y للإعادة — زي أي برنامج احترافي. بنتجاهل
  // الاختصار وهو المستخدم بيكتب في حقل نصي عشان مايتعارضش مع تراجع الكتابة
  // العادي المدمج في المتصفح (undo داخل input/textarea).
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (username) {
      refresh();
      refreshLifeAreas();
      refreshArchiveCount();
      refreshPendingRestore();
      getProfile()
        .then((data) => {
          setDisplayName(data.profile.displayName);
          setAvatarUrl(data.profile.avatarUrl);
        })
        .catch(() => {
          // اسم العرض والأفتار تجميليين بس، لو فشل الطلب نسيب اسم المستخدم
          // العادي وحرفه الأول يظهروا بدلهم
        });
    } else {
      setLoading(false);
    }
  }, [username]);

  async function refreshLifeAreas() {
    try {
      const data = await getLifeAreas();
      setLifeAreas(data);
    } catch {
      // مجالات الحياة تحسينية — لو فشل تحميلها منسيبش الموقع كله يتعطل بسببها
    }
  }

  // بنجيب عدد المهام المؤرشفة بس (من غير تفاصيلها) عشان نعرضه كإحصائية سريعة
  // فوق، وبنعيد جلبه بعد أي refresh() للمهام النشطة عشان يفضل متزامن مع أي
  // أرشفة/استرجاع تلقائي حصل في السيرفر.
  async function refreshArchiveCount() {
    try {
      const data = await getArchive();
      setArchiveCount(data.length);
      let done = 0;
      let total = 0;
      for (const l of data as { items: { isDone: boolean }[] }[]) {
        for (const it of l.items) {
          total += 1;
          if (it.isDone) done += 1;
        }
      }
      setArchiveStats({ done, total });
    } catch {
      // إحصائية تجميلية بس — مفيش داعي نزعج المستخدم لو فشلت
    }
  }

  // بنتأكد من حالة الموقع (وضع الصيانة) أول ما التطبيق يفتح، وبعدين كل 15
  // ثانية طول الوقت — عشان أي مستخدم واقف في صفحة الصيانة يرجعله الموقع
  // تلقائيًا فور ما الأدمن يلغي الصيانة، من غير ما يحتاج يعمل refresh بنفسه.
  useEffect(() => {
    let cancelled = false;
    async function checkStatus() {
      try {
        const status = await getSiteStatus();
        if (!cancelled) setSiteStatus(status);
      } catch {
        // لو السيرفر مش راجع رد أصلًا، الأفضل نسيب المستخدم يكمل بدل ما نقفل
        // عليه الوصول بالغلط بسبب مشكلة شبكة عابرة.
      } finally {
        if (!cancelled) setStatusChecked(true);
      }
    }
    checkStatus();
    const interval = window.setInterval(checkStatus, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function refreshPendingRestore() {
    try {
      const data = await getPendingRestoreLists();
      setPendingRestoreLists(data);
    } catch {
      // تجميلي زي باقي إحصائيات الهيدر — فشل مؤقت مش لازم يعطّل الشاشة الرئيسية
    }
  }

  // بيتنادى بعد ما المستخدم يضغط "إضافة المهمة" في قسم "بانتظار المراجعة"
  // (شوف PendingRestoreSection) — بيؤكّد رجوع المهمة فعليًا لمكانها الطبيعي
  // في قائمة المهام النشطة.
  async function handleFinalizeRestore(id: string) {
    const target = pendingRestoreLists.find((l) => l.id === id);
    setPendingRestoreLists((prev) => prev.filter((l) => l.id !== id));
    try {
      await finalizeRestore(id);
      sounds.success();
      toast.success(target ? `"${target.title}" رجعت لقائمة مهامك النشطة` : 'المهمة رجعت لقائمة مهامك النشطة');
      await refresh();
    } catch (err) {
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنهاء استرجاع المهمة');
      refreshPendingRestore();
    }
  }

  // بنجيب حالة اشتراك إشعارات الجهاز أول ما المستخدم يسجّل دخول، بدون ما
  // نطلب إذن تلقائيًا — بس عشان نعرف نعرض زرار "تفعيل" أو "مفعّل" صح.
  useEffect(() => {
    if (!username) return;
    getPushState().then(setPushState);
  }, [username]);

  // استقصاء التذكيرات المستحقة كل 15 ثانية: الجدولة في السيرفر هي اللي
  // بتحدد فعليًا امتى التذكير "استحق" وتبعت إشعار الجهاز، وهنا بس بنعرض
  // إشعار داخل الموقع (toast + صوت) لأي تذكير استحق حديثًا لسه ماعرضناهوش
  // في الجلسة دي، عشان المستخدم ياخد تنبيه واضح حتى لو التاب فاتح قدامه.
  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    async function poll() {
      try {
        const due = await getDueReminders();
        if (cancelled) return;
        const fresh = due.filter((r: Reminder) => !shownReminderIds.current.has(r.id));
        if (fresh.length > 0) {
          sounds.reminder();
          fresh.forEach((r: Reminder) => {
            shownReminderIds.current.add(r.id);
            toast.reminder(r.message?.trim() || 'عندك مهمة محتاجة انتباهك دلوقتي');
          });
        }
      } catch {
        // فشل الاستقصاء (مشكلة شبكة عابرة) مش لازم يزعج المستخدم بـ toast خطأ
      }
    }

    poll();
    const interval = window.setInterval(poll, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [username]);

  async function handleTogglePush() {
    if (pushState === 'unsupported') {
      toast.error('الجهاز أو المتصفح ده مش بيدعم إشعارات الجهاز');
      return;
    }
    if (pushState === 'denied') {
      toast.error('إذن الإشعارات متمنوع من إعدادات المتصفح — لازم تفعّله من هناك الأول');
      return;
    }
    if (pushState === 'subscribed') {
      await disablePush();
      setPushState('default');
      sounds.notify();
      toast.info('اتلغى تفعيل إشعارات الجهاز');
      return;
    }
    try {
      await enablePush();
      setPushState('subscribed');
      toast.success('اتفعّلت إشعارات الجهاز');
      sounds.success();
    } catch (err) {
      if (err instanceof PushError && err.code === 'permission_denied') {
        setPushState('denied');
      }
      const message = err instanceof PushError ? err.message : 'تعذّر تفعيل إشعارات الجهاز — حصل خطأ غير متوقع';
      if (!(err instanceof PushError)) {
        console.error('[push] unexpected error while enabling push:', err);
      }
      toast.error(message);
    }
  }

  async function refresh() {
    try {
      const data = await getLists();
      setLists(data);
      refreshArchiveCount();
    } catch (err) {
      if (err instanceof MaintenanceError) {
        setSiteStatus((prev) => (prev ? { ...prev, maintenanceMode: true, maintenanceMessage: err.message } : prev));
        return;
      }
      if (err instanceof SessionExpiredError) return;
      toast.error(err instanceof Error ? err.message : 'حصل خطأ في تحميل المهام الرئيسية');
    } finally {
      setLoading(false);
    }
  }

  function handleAuthSuccess(name: string, admin: boolean) {
    resetSessionExpiredGuard();
    localStorage.setItem('username', name);
    localStorage.setItem('isAdmin', String(admin));
    setUsername(name);
    setIsAdmin(admin);
    setLoading(true);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('isAdmin');
    setUsername(null);
    setIsAdmin(false);
    setDisplayName(null);
    setAvatarUrl(null);
    setLists([]);
    setLifeAreas([]);
    sounds.click();
  }

  // بدل ما زرار الخروج يسجّل خروج فورًا، بنفتح نافذة تأكيد الأول عشان
  // نتجنب أي خروج بالغلط بضغطة واحدة.
  function requestLogout() {
    setLogoutConfirmOpen(true);
  }

  function confirmLogout() {
    setLogoutConfirmOpen(false);
    handleLogout();
  }

  function openDashboard() {
    setAdminInitialTab('overview');
    setView('admin');
  }

  function handleToggleMute() {
    setMuted(sounds.toggleMuted());
  }

  // بيعيد تنفيذ إنشاء مهمة رئيسية من نفس بيانات النموذج الأصلية — بتُستخدم
  // أول مرة لما المستخدم يضيف مهمة، وبعدين تاني كـ "Redo" لو المستخدم تراجع
  // (Undo) عن الإضافة وحب يرجّعها. بترجع الـ list الناتج عشان نعرف الـ id
  // الجديد (بيتغيّر كل مرة لأن كل إنشاء بياخد id مختلف من السيرفر).
  async function createTaskFromPayload(data: NewTaskPayload) {
    const { title, subtasks, priority, category, targetYear, lifeAreaId, startTime, endTime, reminder } = data;
    const list = await createList(title, priority, category, targetYear, lifeAreaId, startTime, endTime);
    for (const content of subtasks) {
      await addItem(list.id, content);
    }
    if (reminder && startTime) {
      const remindAt = new Date(new Date(startTime).getTime() - reminder.offsetMinutes * 60 * 1000).toISOString();
      await createReminder({
        listId: list.id,
        mode: 'CUSTOM',
        remindAt,
        message: reminder.message || undefined,
      });
    }
    return list;
  }

  async function handleCreate(data: NewTaskPayload) {
    const { title } = data;
    sounds.addItem();
    // تحديث تفاؤلي: المهمة الرئيسية بتظهر فورًا من غير ما ننتظر السيرفر
    const tempId = `temp-${Date.now()}`;
    setLists((prev) => [...prev, { id: tempId, title, priority: data.priority, category: data.category, targetYear: data.targetYear, lifeAreaId: data.lifeAreaId, items: [] }]);
    try {
      const list = await createTaskFromPayload(data);
      // ref قابل للتعديل بيتبع آخر id فعلي للمهمة دي — لازم نحدّثه بعد أي
      // Undo/Redo لاحق عشان الأمر التالي (سواء تراجع أو إعادة) يشتغل على
      // النسخة الصحيحة من المهمة، مش على id قديم بقى غير موجود في قاعدة البيانات.
      const ref = { id: list.id as string };
      pushCommand({
        label: `إضافة "${title}"`,
        undo: async () => {
          await deleteList(ref.id);
          await refresh();
          toast.info(`تم التراجع عن إضافة "${title}"`);
        },
        redo: async () => {
          const recreated = await createTaskFromPayload(data);
          ref.id = recreated.id;
          await refresh();
          toast.success(`تمت إعادة إضافة "${title}"`);
        },
      });
      await refresh();
      toast.success(`"${title}" اتضافت بنجاح`);
    } catch (err) {
      setLists((prev) => prev.filter((l) => l.id !== tempId));
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر إنشاء المهمة الرئيسية');
    }
  }

  // بيعيد إنشاء مهمة رئيسية بالكامل (بعناوينها الأصلية + كل مهامها الفرعية
  // وحالة إنجاز كل واحدة منها) — دي "نسخة الاسترجاع" اللي بيستخدمها Undo بعد
  // حذف مهمة بالغلط، فترجع المهمة زي ما كانت بالظبط قبل الحذف.
  async function recreateListSnapshot(snapshot: List) {
    const recreated = await createList(
      snapshot.title,
      snapshot.priority,
      snapshot.category,
      snapshot.targetYear,
      snapshot.lifeAreaId,
      snapshot.startTime,
      snapshot.endTime
    );
    for (const item of snapshot.items || []) {
      const newItem = await addItem(recreated.id, item.content, item.priority);
      if (item.isDone) {
        await toggleItem(newItem.id, true);
      }
    }
    return recreated;
  }

  async function handleDelete(id: string) {
    const snapshot = lists;
    const target = lists.find((l) => l.id === id);
    sounds.deleteItem();
    setLists((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteList(id);
      if (target) {
        // ref.id بيتبع آخر id حقيقي للمهمة المتراجع عنها/المعاد حذفها —
        // بيتغيّر كل مرة نعيد إنشاءها بعد Undo لأن id السيرفر بيبقى جديد.
        const ref = { id };
        pushCommand({
          label: `حذف "${target.title}"`,
          undo: async () => {
            const recreated = await recreateListSnapshot(target);
            ref.id = recreated.id;
            await refresh();
            sounds.success();
            toast.success(`تم استرجاع "${target.title}"`);
          },
          redo: async () => {
            await deleteList(ref.id);
            await refresh();
            toast.info(`تم حذف "${target.title}" مرة أخرى`);
          },
        });
      }
    } catch (err) {
      setLists(snapshot);
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف المهمة الرئيسية');
    }
  }

  // نفس فكرة handleDelete بالظبط، بس لمهمة لسه في منطقة "بانتظار المراجعة"
  // (مش في القائمة النشطة) — عشان الحذف يحدّث الحالة الصحيحة فورًا.
  async function handleDeletePendingRestore(id: string) {
    const snapshot = pendingRestoreLists;
    sounds.deleteItem();
    setPendingRestoreLists((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteList(id);
    } catch (err) {
      setPendingRestoreLists(snapshot);
      sounds.error();
      toast.error(err instanceof Error ? err.message : 'تعذّر حذف المهمة');
    }
  }

  // بيودّي الشاشة لأي قسم (عاجل / مجال حياة معيّن) بالاسكرول الناعم — ده
  // تنقّل بس (مش فلترة)، فمفيش أي مهمة بتختفي، بس بيوصلك لمكانها بثانية.
  function scrollToSection(sectionId: string) {
    sounds.click();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // اختصار من بطاقات الإحصائيات: بيوديك لأول مهمة رئيسية غير مكتملة من
  // نفس التصنيف ويضيء حواليها لثانيتين، بدل ما يخفي باقي المهام بفلتر.
  function jumpToCategory(key: CategoryKey) {
    const target = lists.find((l) => l.category === key && !isListDone(l as any));
    if (!target) {
      sounds.error();
      toast.info('مفيش مهمة رئيسية غير مكتملة من التصنيف ده حاليًا');
      return;
    }
    sounds.click();
    setHighlightedListId(target.id);
    document.getElementById(`list-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedListId(null), 2200);
  }

  const blockedByMaintenance = !!siteStatus?.maintenanceMode && !isAdmin;

  // ملاحظة: القائمة النشطة (lists) بترجع من السيرفر من غير أي مهمة اكتملت
  // بالكامل، لأنها بتتؤرشف تلقائيًا وتتنقل لصفحة الأرشيف — فمفيش داعي لتبويب
  // "مكتملة" هنا تاني، "نشطة" هي كل حاجة موجودة أصلًا.
  // التنظيم الجديد: بدل فلترة يدوية مستمرة، المهام بتترتب تلقائيًا حسب
  // الأولوية وتتجمّع حسب مجال الحياة — قسم "عاجل الآن" بيوفّر وصول فوري
  // لأهم المهام من غير ما يحتاج المستخدم يدوّر أو يفعّل أي فلتر.
  const urgent = urgentLists(lists as any, 6);
  const groups = groupByLifeArea(lists as any, lifeAreas);
  const hierGroups = groupHierarchical(lists as any, lifeAreas);

  if (!statusChecked) {
    return (
      <>
        <ToastContainer />
        <div className="app-boot" aria-hidden="true">
          <span className="app-boot-spinner" />
        </div>
      </>
    );
  }

  if (blockedByMaintenance) {
    return (
      <>
        <ToastContainer />
        <MaintenancePage
          emoji={siteStatus?.maintenanceEmoji || 'wrench'}
          message={siteStatus?.maintenanceMessage || 'الموقع تحت الصيانة حاليًا، هنرجع قريب'}
          siteName={siteStatus?.siteName || 'الموقع'}
          onAdminSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  if (!username) {
    return (
      <>
        <ToastContainer />
        <ThemeToggleButton />
        <div className="auth-shell view-fade">
          <div className="auth-shell-brand">
            <div className="auth-shell-orbit" aria-hidden="true">
              <span className="orbit-icon orbit-icon-1"><DynamicIcon name="check-circle" size={26} /></span>
              <span className="orbit-icon orbit-icon-2"><DynamicIcon name="calendar-days" size={20} /></span>
              <span className="orbit-icon orbit-icon-3"><DynamicIcon name="star" size={16} /></span>
              <span className="orbit-icon orbit-icon-4"><DynamicIcon name="target" size={22} /></span>
              <span className="orbit-icon orbit-icon-5"><DynamicIcon name="sparkles" size={18} /></span>
              <span className="orbit-icon orbit-icon-6"><DynamicIcon name="timer" size={20} /></span>
            </div>
            <DynamicIcon name="clipboard-list" size={22} className="auth-shell-mark" />
            <h2 className="auth-shell-name">قائمة المهام</h2>
            <p className="auth-shell-tagline">مساحتك لتنظيم مهامك، بتصميم بسيط وسريع يخليك تركّز على اللي محتاج تخلّصه.</p>
            <ul className="auth-shell-points">
              <li>
                <span className="auth-shell-point-icon">
                  <DynamicIcon name="check" size={14} />
                </span>
                قوائم رئيسية ومهام فرعية بترتيب أولويات واضح
              </li>
              <li>
                <span className="auth-shell-point-icon">
                  <DynamicIcon name="check" size={14} />
                </span>
                تتبّع تقدمك بنسب مئوية ومؤشرات حية
              </li>
              <li>
                <span className="auth-shell-point-icon">
                  <DynamicIcon name="check" size={14} />
                </span>
                حماية بخطوتين وكود استرجاع لحسابك
              </li>
            </ul>
          </div>
          <div className="auth-shell-form">
            <AuthForm onSuccess={handleAuthSuccess} />
          </div>
        </div>
      </>
    );
  }

  // القائمة الجانبية ونافذة تأكيد الخروج مشتركتين بين كل شاشات المستخدم
  // المسجّل دخول (المهام، البروفايل، الأرشيف، مجالات الحياة، المهام
  // المتكررة، ولوحة التحكم) — عشان تبديل الثيم والخروج وباقي الاختصارات
  // يبقوا متاحين من أي شاشة، مش بس من الشاشة الرئيسية.
  const sideMenuAndModals = (
    <>
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isAdmin={isAdmin}
        archiveCount={archiveCount}
        muted={muted}
        pushState={pushState}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        undoRedoBusy={undoRedoBusy}
        onUndo={() => undo()}
        onRedo={() => redo()}
        onOpenDashboard={openDashboard}
        onOpenArchive={() => setView('archive')}
        onOpenLifeAreas={() => setView('lifeAreas')}
        onOpenRecurring={() => setView('recurring')}
        onToggleMute={handleToggleMute}
        onTogglePush={handleTogglePush}
        onRequestLogout={requestLogout}
      />
      {logoutConfirmOpen && (
        <ConfirmModal
          title="تسجيل الخروج"
          description="هتحتاج تسجّل دخول تاني عشان تكمل شغلك. متأكد إنك عايز تخرج؟"
          confirmLabel="تسجيل الخروج"
          cancelLabel="إلغاء"
          danger
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={confirmLogout}
        />
      )}
    </>
  );

  if (view === 'admin') {
    return (
      <>
        <ToastContainer />
        <div className="view-fade">
          <AdminDashboard
            onBack={() => setView('todos')}
            initialTab={adminInitialTab}
            onOpenMenu={() => setMenuOpen(true)}
            menuOpen={menuOpen}
          />
        </div>
        {sideMenuAndModals}
      </>
    );
  }

  if (view === 'profile') {
    return (
      <>
        <ToastContainer />
        <Profile
          onBack={() => setView('todos')}
          onDisplayNameChange={setDisplayName}
          onAvatarChange={setAvatarUrl}
          onOpenMenu={() => setMenuOpen(true)}
          menuOpen={menuOpen}
        />
        {sideMenuAndModals}
      </>
    );
  }

  if (view === 'lifeAreas') {
    return (
      <>
        <ToastContainer />
        <LifeAreasManager
          onBack={() => setView('todos')}
          onChange={() => {
            refreshLifeAreas();
            refresh();
          }}
          onOpenMenu={() => setMenuOpen(true)}
          menuOpen={menuOpen}
        />
        {sideMenuAndModals}
      </>
    );
  }

  if (view === 'archive') {
    return (
      <>
        <ToastContainer />
        <ArchivePage
          onBack={() => setView('todos')}
          onChange={() => {
            refresh();
            refreshPendingRestore();
          }}
          onOpenMenu={() => setMenuOpen(true)}
          menuOpen={menuOpen}
          lifeAreas={lifeAreas}
          onManageLifeAreas={() => setView('lifeAreas')}
        />
        {sideMenuAndModals}
      </>
    );
  }

  if (view === 'recurring') {
    return (
      <>
        <ToastContainer />
        <RecurringTasksManager
          lifeAreas={lifeAreas}
          onBack={() => setView('todos')}
          onChange={refresh}
          onManageLifeAreas={() => setView('lifeAreas')}
          onOpenMenu={() => setMenuOpen(true)}
          menuOpen={menuOpen}
          onLifeAreaCreated={(area) => setLifeAreas((prev) => (prev.some((a) => a.id === area.id) ? prev : [...prev, area]))}
        />
        {sideMenuAndModals}
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <div className="container view-fade">
        {isAdmin && siteStatus?.maintenanceMode && (
          <div className="maintenance-banner">
            <span><DynamicIcon name="wrench" size={16} /> وضع الصيانة مفعّل حاليًا — المستخدمين العاديين مش شايفين الموقع غيرك.</span>
            <button className="small" onClick={() => setView('admin')} type="button">
              إدارة الإعدادات
            </button>
          </div>
        )}
        <div className="top-bar">
          <div className="top-bar-grid">
            <button
              className="header-user"
              onClick={() => setView('profile')}
              type="button"
              title="الملف الشخصي"
            >
              <span className="header-user-meta">
                <span className="header-user-greeting">
                  مرحبًا، <strong className="header-user-name">{displayName || username}</strong>
                </span>
                {/* TODO: عنصر Placeholder فقط — سيتم لاحقاً إضافة نظام الاستريك
                    الحقيقي (حساب الأيام المتتالية) وربطه بالبيانات الفعلية.
                    من غير أي منطق أو state دلوقتي عن قصد. */}
                <span className="header-streak" title="أيام الإنجاز المتتالية">
                  <span className="header-streak-icon" aria-hidden="true">🔥</span>
                  <span className="header-streak-count">0</span>
                </span>
              </span>
              <span className="header-user-avatar">
                {avatarUrl ? (
                  <img src={resolveAvatarUrl(avatarUrl) ?? undefined} alt="" />
                ) : (
                  (displayName || username)?.trim().charAt(0).toUpperCase()
                )}
              </span>
            </button>

            <div className="brand">
              <h1 className="brand-title">المهام الرئيسية</h1>
            </div>

            <div className="top-bar-controls">
              <button
                className="icon-btn hamburger-btn"
                onClick={() => setMenuOpen(true)}
                type="button"
                title="القائمة"
                aria-label="فتح القائمة"
                aria-haspopup="true"
                aria-expanded={menuOpen}
              >
                <span className="hamburger-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="stats-col">
          <TaskDistributionCard lists={lists} onSelectCategory={jumpToCategory} />
          <CompletionRateCard lists={lists} onSelectCategory={jumpToCategory} />
        </div>

        <div className="quick-add-row quick-add-row-compact">
          <button className="quick-add-card" onClick={() => setAddTaskOpen(true)} type="button">
            <span className="quick-add-icon-wrap">
              <DynamicIcon name="plus" size={18} />
            </span>
            <span className="quick-add-label">إضافة مهمة</span>
          </button>

          <button className="quick-add-card quick-add-card-recurring" onClick={() => setView('recurring')} type="button">
            <span className="quick-add-icon-wrap quick-add-icon-wrap-recurring">
              <DynamicIcon name="repeat" size={18} />
              <span className="quick-add-badge">
                <DynamicIcon name="plus" size={9} />
              </span>
            </span>
            <span className="quick-add-label">إضافة مهمة متكررة</span>
          </button>
        </div>

        <AddTaskModal
          open={addTaskOpen}
          lifeAreas={lifeAreas}
          onClose={() => setAddTaskOpen(false)}
          onManageLifeAreas={() => {
            setAddTaskOpen(false);
            setView('lifeAreas');
          }}
          onCreate={handleCreate}
          onLifeAreaCreated={(area) => setLifeAreas((prev) => (prev.some((a) => a.id === area.id) ? prev : [...prev, area]))}
        />

        <PendingRestoreSection
          lists={pendingRestoreLists}
          onChange={refreshPendingRestore}
          onFinalize={handleFinalizeRestore}
          onDeleteList={handleDeletePendingRestore}
          lifeAreas={lifeAreas}
          onManageLifeAreas={() => setView('lifeAreas')}
        />

        {loading && (
          <div className="lists-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
        )}

        {!loading && lists.length === 0 && (
          <p className="empty">
            <DynamicIcon name="sticky-note" size={32} className="empty-icon" />
            مفيش مهام رئيسية لسه، ابدأ بإنشاء أول مهمة
          </p>
        )}

        {!loading && lists.length > 0 && (groups.length > 1 || urgent.length > 0) && (
          <nav className="quick-nav" aria-label="تنقّل سريع بين الأقسام">
            {urgent.length > 0 && (
              <button className="quick-nav-chip quick-nav-urgent" onClick={() => scrollToSection('section-urgent')} type="button">
                <DynamicIcon name="alert" size={13} /> عاجل الآن
                <span className="quick-nav-count">{urgent.length}</span>
              </button>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                className="quick-nav-chip"
                style={{ ['--chip-color' as any]: g.color }}
                onClick={() => scrollToSection(`section-area-${g.id}`)}
                type="button"
              >
                <DynamicIcon name={(g.icon as any) || 'tag'} size={13} /> {g.name}
                <span className="quick-nav-count">{g.lists.length}</span>
              </button>
            ))}
          </nav>
        )}

        {!loading && urgent.length > 0 && (
          <section id="section-urgent" className="task-section task-section-urgent">
            <div className="task-section-header">
              <h3>
                <DynamicIcon name="alert" size={16} /> عاجل الآن
              </h3>
              <span className="task-section-count">{urgent.length}</span>
            </div>
            <p className="task-section-hint">أعلى أولوية أو أقرب موعد استحقاق — دي أول حاجة تستاهل وقتك</p>
            <div className="lists-grid">
              {urgent.map((list, i) => (
                <TodoList
                  key={`urgent-${list.id}`}
                  list={list}
                  onChange={refresh}
                  onDeleteList={handleDelete}
                  delay={i * 60}
                  lifeAreas={lifeAreas}
                  onManageLifeAreas={() => setView('lifeAreas')}
                />
              ))}
            </div>
          </section>
        )}

        {!loading && (
          <TaskHierarchy
            groups={hierGroups}
            onChange={refresh}
            onDeleteList={handleDelete}
            lifeAreas={lifeAreas}
            onManageLifeAreas={() => setView('lifeAreas')}
            highlightedListId={highlightedListId}
          />
        )}
      </div>
      {sideMenuAndModals}
    </>
  );
}
