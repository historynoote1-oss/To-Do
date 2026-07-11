import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRoutes from './routes/auth';
import listsRoutes from './routes/lists';
import itemsRoutes from './routes/items';
import { verifyUser } from './middleware/verifyUser';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
  })
);
app.use(express.json());

// تسجيل الدخول وإنشاء الحساب مفتوحين (مفيش توكن لسه)
app.use('/api/auth', authRoutes);

// كل حاجة تانية لازم تسجيل دخول
app.use('/api/lists', verifyUser, listsRoutes);
app.use('/api', verifyUser, itemsRoutes);

app.get('/', (_req, res) => res.send('Todo Backend يعمل ✅'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
