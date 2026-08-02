// لازم يتحمّل قبل أي حاجة تانية بتستخدم express.Router — بيعمل "patch" لـ
// Express عشان أي خطأ يتضرب جوه async route handler يتلقط تلقائيًا ويتبعت
// للـ error-handling middleware في آخر الملف، بدل ما الطلب يفضل معلّق للأبد
// (Express 4 مبيمسكش الـ rejected promises من الـ async functions لوحده).
import 'express-async-errors';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import authRoutes from './routes/auth';
import listsRoutes from './routes/lists';
import trashRoutes from './routes/trash';
import lifeAreasRoutes from './routes/lifeAreas';
import itemsRoutes from './routes/items';
import adminRoutes from './routes/admin';
import adminAnalyticsRoutes from './routes/adminAnalytics';
import adminContentRoutes from './routes/adminContent';
import adminSettingsRoutes from './routes/adminSettings';
import adminVoiceRoomsRoutes from './routes/adminVoiceRooms';
import profileRoutes from './routes/profile';
import siteRoutes from './routes/site';
import remindersRoutes from './routes/reminders';
import pushRoutes from './routes/push';
import streakRoutes from './routes/streak';
import notificationsRoutes from './routes/notifications';
import youtubeRoutes from './routes/youtube';
import voiceRoomsRoutes from './routes/voiceRooms';
import databasesRoutes from './routes/databases';
import { verifyUser } from './middleware/verifyUser';
import { requireAdmin } from './middleware/requireAdmin';
import { maintenanceGate } from './middleware/maintenanceGate';
import { rehabilitationGate } from './middleware/rehabilitationGate';
import { startReminderScheduler } from './schedulers/reminderScheduler';
import { startOverdueScheduler } from './schedulers/overdueScheduler';
import { startTrashScheduler } from './schedulers/trashScheduler';
import { initVoiceRoomsSocket } from './realtime/voiceRooms';

const app = express();

// السيرفر شغال خلف بروكسي (Railway/Vercel/إلخ)؛ الإعداد ده ضروري عشان req.ip
// ياخد الـ IP الحقيقي بتاع الزائر مش IP البروكسي نفسه — وده بيأثر مباشرة على
// دقة الـ rate limiting وسجلات تسجيل الدخول والـ audit log.
app.set('trust proxy', 1);

// هيدرز أمان عامة على مستوى HTTP (منع clickjacking، إجبار المتصفح ميخمنش نوع
// المحتوى، إلخ). ده جزء من "الأمان الحقيقي" اللي بيحصل في السيرفر، عكس فكرة
// "إخفاء الكود" اللي مش ممكنة أصلاً لأي تطبيق يشتغل جوه المتصفح.
// الـ API ده مبيرجعش HTML خالص (json بس)، فـ CSP بتاعه مضيّق لأقصى درجة:
// مفيش سماح لأي مصدر خارجي يحمّل سكريبت/ستايل/إطار جوه رد السيرفر نفسه.
//
// crossOriginResourcePolicy: 'same-site' هي اللي كانت بتسبب "Failed to
// fetch" العشوائي في الفرونت إند. الفرونت إند (Vercel) والباك إند
// (Railway) على دومينين مختلفين تمامًا (مش same-site)، فلما الرد بييجي
// بهيدر same-site، المتصفح بيرفض يسيب الـ JS يقرا الرد حتى لو الطلب نفسه
// نجح ورجع 200 — وده بالظبط شكل "Failed to fetch" (خطأ شبكة من وجهة نظر
// fetch()، مش خطأ من السيرفر أصلاً، فمكانش هيبان في أي لوج باك إند).
// كان فيه استثناء واحد بس لمسار /uploads (صور الأفتار) اتظبط صح قبل كده،
// لكن باقي الـ API (بيانات البروفايل، القوائم، إلخ) فضل تحت same-site.
// الحل: cross-origin على مستوى الـ API كله، مادام أصلاً الوصول متحكم فيه
// بالتوكن (Authorization) + إعداد CORS تحت — مش محتاجين حاجز CORP إضافي
// فوق ده لأداة API مبنية تتنادى من دومين تاني بالتصميم.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// origin بيتقارن نص مقابل نص، فأي اختلاف بسيط زي "/" زيادة في الآخر
// (FRONTEND_URL="https://example.com/" بدل "https://example.com") كان
// بيخلي المقارنة تفشل والـ CORS يترفض تمامًا — نفس نوع مشكلة الـ
// trailing-slash اللي حصلت قبل كده مع Railway. بنشيل أي "/" زيادة من
// الآخر قبل المقارنة عشان الإعداد يفضل شغال حتى لو اتحطت بمسافة زيادة
// في متغيرات البيئة على Railway.
const configuredFrontendUrl = process.env.FRONTEND_URL?.trim().replace(/\/+$/, '');

app.use(
  cors({
    origin: configuredFrontendUrl || '*',
  })
);
app.use(express.json());

// صور الأفتار المرفوعة بتتعرض من هنا كملفات ثابتة عامة (بدون تسجيل دخول،
// زي أي رابط صورة عادي). الـ CSP اللي فوق مضيّق جدًا لأنه مبني على إن الـ
// API كله JSON، فهنا بنستثني المسار ده فقط ونفتح Cross-Origin-Resource-Policy
// عشان الفرونت إند (على دومين تاني غالبًا) يقدر يعرض الصور في <img> عادي.
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// حماية ضد محاولات تخمين كلمة المرور المتكررة على مستوى الـ IP: 10 محاولات كل 15 دقيقة لكل جهاز
// (وفي جانب الحساب نفسه، فيه حماية إضافية جوه routes/auth.ts بتقفل الحساب بعد محاولات فاشلة كتير)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'محاولات كتير جدًا، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
});

// حماية أشد لمسارات الأدمن: حتى لو التوكن سليم، أي جهاز واحد ميقدرش يضرب
// عدد كبير من العمليات الحساسة (حذف/تعليق/إعادة تعيين) في وقت قصير
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { error: 'عدد كبير من عمليات الأدمن في وقت قصير، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
});

// قراءة عامة (بدون تسجيل دخول) لحالة الموقع (وضع الصيانة، إلخ) — بتحتاج
// حد معقول برضو عشان محدش يضرب الـ endpoint ده بعدد ضخم من الطلبات.
const siteStatusLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  message: { error: 'طلبات كتير جدًا، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
});

// حماية لمسارات الملف الشخصي: فيها عمليات بتتحقق من كلمة المرور الحالية
// (تغيير الباسورد، تولّيد كود استرجاع جديد)، فمحتاجة حد معقول برضو حتى لو
// التوكن نفسه سليم ومسجّل دخول بالفعل.
//
// السبب الجذري لمشكلة "صفحة البروفايل بتقف كل شوية": الحد ده كان متطبّق
// على *كل* المسارات تحت /api/profile من غير استثناء — يعني حتى القراءة
// العادية GET / (بتتنفذ كل مرة المستخدم يفتح الصفحة أو يرجعلها) كانت
// بتستهلك من نفس الكوتة المحدودة (20 كل 15 دقيقة) المفروض تحمي بيها
// العمليات الحساسة بس. استخدام عادي للتطبيق (فتح الصفحة، خروج ورجوع،
// استئناف من الخلفية) كان كافي يستهلك الكوتة دي في دقايق، وبعدها أي
// طلب GET كان بيترفض بـ 429 لحد ما نافذة الـ 15 دقيقة تعيد نفسها من
// الأول — وده بالظبط اللي بيبان كـ"عطل دوري متكرر". الحل: نستثني القراءة
// العادية (GET /) من العدّ، وتفضل الحماية شغالة زي ما هي على كل العمليات
// الحساسة الفعلية (رفع/حذف أفتار، تغيير باسورد، تولید كود استرجاع).
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'عدد كبير من العمليات في وقت قصير، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' && req.path === '/',
});

// حد معقول لعمليات بحث يوتيوب لكل جهاز: البحث بيستهلك من الحصة اليومية
// المحدودة لمفتاح YouTube Data API (نفس المفتاح مشترك بين كل مستخدمي
// الموقع)، فالحد ده بيمنع جهاز واحد من استهلاك الحصة كلها لوحده.
const youtubeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  message: { error: 'عدد كبير من عمليات البحث في وقت قصير، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/site', siteStatusLimiter, siteRoutes);

app.use('/api/lists', verifyUser, rehabilitationGate, maintenanceGate, listsRoutes);
app.use('/api/trash', verifyUser, rehabilitationGate, maintenanceGate, trashRoutes);
app.use('/api/life-areas', verifyUser, rehabilitationGate, maintenanceGate, lifeAreasRoutes);
app.use('/api/youtube', verifyUser, rehabilitationGate, maintenanceGate, youtubeLimiter, youtubeRoutes);
app.use('/api/voice-rooms', verifyUser, rehabilitationGate, maintenanceGate, voiceRoomsRoutes);
app.use('/api', verifyUser, rehabilitationGate, maintenanceGate, remindersRoutes);
app.use('/api', verifyUser, rehabilitationGate, maintenanceGate, pushRoutes);
app.use('/api/streak', verifyUser, rehabilitationGate, maintenanceGate, streakRoutes);
app.use('/api/databases', verifyUser, rehabilitationGate, maintenanceGate, databasesRoutes);
app.use('/api', verifyUser, rehabilitationGate, maintenanceGate, notificationsRoutes);
app.use('/api/profile', verifyUser, rehabilitationGate, maintenanceGate, profileLimiter, profileRoutes);
app.use('/api/admin/analytics', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminAnalyticsRoutes);
app.use('/api/admin/content', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminContentRoutes);
app.use('/api/admin/settings', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminSettingsRoutes);
app.use('/api/admin/voice-rooms', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminVoiceRoomsRoutes);
app.use('/api/admin', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminRoutes);
// المسار العام ده لازم يكون آخر واحد، لأنه بيتطابق مع أي حاجة تبدأ بـ /api
app.use('/api', verifyUser, rehabilitationGate, maintenanceGate, itemsRoutes);

app.get('/', (_req, res) => res.send('Todo Backend يعمل ✅'));

// أي مسار مش موجود أصلاً بيرجع 404 JSON واضح، بدل صفحة الـ HTML الافتراضية
// بتاعة Express (اللي مش منطقية لـ API بيرجع JSON بس).
app.use((_req, res) => {
  res.status(404).json({ error: 'المسار ده غير موجود' });
});

// error-handling middleware لازم يكون آخر app.use في الملف (4 باراميترز
// عشان Express يعرف إنه ده الـ error handler). بيلتقط أي خطأ اتضرب في أي
// route (بما فيها الـ async ones بفضل express-async-errors فوق)، يسجّله في
// الـ logs، وبيرجع رد JSON موحّد للعميل بدل ما الطلب يفضل معلّق أو السيرفر يقع.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled route error:', err);
  if (res.headersSent) return;
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({ error: 'حصل خطأ غير متوقع في السيرفر، حاول تاني بعد شوية' });
});

// شبكة أمان إضافية: لو لسبب ما promise اتعمله reject من غير ما حد يلتقطه
// (مثلاً جوه scheduler شغال في الخلفية مش جوه request/response)، نسجّله
// بدل ما نسيب Node يوقّف البروسيس كله فجأة (السلوك الافتراضي من Node 15+).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const PORT = process.env.PORT || 3001;

// بنلف الـ app جوه http.Server صراحةً (بدل app.listen مباشرة) عشان
// Socket.IO (المستخدم في الغرف الصوتية الحيّة) محتاج نفس السيرفر ده بالظبط
// يشتغل عليه، مش سيرفر منفصل على بورت تاني.
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: configuredFrontendUrl || '*' },
});
initVoiceRoomsSocket(io);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// جدولة فحص التذكيرات المستحقة (كل 15 ثانية) وإرسال إشعارات الجهاز لها —
// شغالة طول عمر البروسيس، مش محتاجة مسار API منفصل.
startReminderScheduler();
startOverdueScheduler();
startTrashScheduler();
