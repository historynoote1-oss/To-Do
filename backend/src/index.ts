import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import authRoutes from './routes/auth';
import listsRoutes from './routes/lists';
import itemsRoutes from './routes/items';
import adminRoutes from './routes/admin';
import adminAnalyticsRoutes from './routes/adminAnalytics';
import adminContentRoutes from './routes/adminContent';
import adminSettingsRoutes from './routes/adminSettings';
import profileRoutes from './routes/profile';
import siteRoutes from './routes/site';
import twoFactorRoutes from './routes/twoFactor';
import { verifyUser } from './middleware/verifyUser';
import { requireAdmin } from './middleware/requireAdmin';
import { maintenanceGate } from './middleware/maintenanceGate';
import { rehabilitationGate } from './middleware/rehabilitationGate';

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
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
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
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'عدد كبير من العمليات في وقت قصير، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
});

// حماية إضافية صارمة لمسارات التحقق بخطوتين: تخمين كود مكوّن من 6 أرقام ممكن
// نظريًا لو الحد الأقصى للمحاولات مش ضيّق كفاية، فهنا الحد أقل بكتير من باقي
// المسارات (8 محاولات كل 15 دقيقة لكل جهاز) — سواء أثناء الدخول أو الإعداد.
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  message: { error: 'محاولات كتير جدًا على التحقق بخطوتين، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth/2fa', twoFactorLimiter, twoFactorRoutes);
app.use('/api/site', siteStatusLimiter, siteRoutes);

app.use('/api/lists', verifyUser, rehabilitationGate, maintenanceGate, listsRoutes);
app.use('/api/profile', verifyUser, rehabilitationGate, maintenanceGate, profileLimiter, profileRoutes);
app.use('/api/admin/analytics', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminAnalyticsRoutes);
app.use('/api/admin/content', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminContentRoutes);
app.use('/api/admin/settings', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminSettingsRoutes);
app.use('/api/admin', verifyUser, rehabilitationGate, requireAdmin, adminLimiter, adminRoutes);
// المسار العام ده لازم يكون آخر واحد، لأنه بيتطابق مع أي حاجة تبدأ بـ /api
app.use('/api', verifyUser, rehabilitationGate, maintenanceGate, itemsRoutes);

app.get('/', (_req, res) => res.send('Todo Backend يعمل ✅'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
