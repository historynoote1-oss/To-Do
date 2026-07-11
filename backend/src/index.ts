import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import authRoutes from './routes/auth';
import listsRoutes from './routes/lists';
import itemsRoutes from './routes/items';
import adminRoutes from './routes/admin';
import { verifyUser } from './middleware/verifyUser';
import { requireAdmin } from './middleware/requireAdmin';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
  })
);
app.use(express.json());

// حماية ضد محاولات تخمين كلمة المرور المتكررة: 10 محاولات كل 15 دقيقة لكل جهاز
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'محاولات كتير جدًا، حاول تاني بعد شوية' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/lists', verifyUser, listsRoutes);
app.use('/api', verifyUser, itemsRoutes);
app.use('/api/admin', verifyUser, requireAdmin, adminRoutes);

app.get('/', (_req, res) => res.send('Todo Backend يعمل ✅'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
