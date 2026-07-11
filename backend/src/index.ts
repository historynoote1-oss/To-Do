import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import authRoutes from './routes/auth';
import listsRoutes from './routes/lists';
import itemsRoutes from './routes/items';
import adminRoutes from './routes/admin';
import { verifyUser } from './middleware/verifyUser';
import { requireAdmin } from './middleware/requireAdmin';

const app = express();

// السيرفر شغال خلف بروكسي (Railway/Vercel/إلخ)؛ الإعداد ده ضروري عشان req.ip
// ياخد الـ IP الحقيقي بتاع الزائر مش IP البروكسي نفسه — وده بيأثر مباشرة على
// دقة الـ rate limiting وسجلات تسجيل الدخول والـ audit log.
app.set('trust proxy', 1);

// هيدرز أمان عامة على مستوى HTTP (منع clickjacking، إجبار المتصفح ميخمنش نوع
// المحتوى، إلخ). ده جزء من "الأمان الحقيقي" اللي بيحصل في السيرفر، عكس فكرة
// "إخفاء الكود" اللي مش ممكنة أصلاً لأي تطبيق يشتغل جوه المتصفح.
app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
  })
);
app.use(express.json());

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

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/lists', verifyUser, listsRoutes);
app.use('/api', verifyUser, itemsRoutes);
app.use('/api/admin', verifyUser, requireAdmin, adminLimiter, adminRoutes);

app.get('/', (_req, res) => res.send('Todo Backend يعمل ✅'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
