import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRoutes from './routes/auth';
import listsRoutes from './routes/lists';
import itemsRoutes from './routes/items';
import { verifyUser } from './middleware/verifyUser';

const app = express();
app.use(cors());
app.use(express.json());

// /token مفتوح (مفيش توكن لسه في الخطوة دي)
app.use('/', authRoutes);

// كل حاجة تانية لازم تتحقق من هوية اليوزر الأول
app.use('/lists', verifyUser, listsRoutes);
app.use('/', verifyUser, itemsRoutes);

app.get('/', (_req, res) => res.send('Todo Activity Backend يعمل ✅'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
