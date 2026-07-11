import fs from 'fs';
import path from 'path';
import multer from 'multer';

// كل صور الأفتار بتتخزن في المجلد ده على السيرفر، وبنعرضه للعامة عن طريق
// express.static في index.ts (اسمه اللي بيتخزن في avatarUrl هو مسار نسبي
// زي /uploads/avatars/xxxx.jpg بيتحط مباشرة في الـ <img>).
// ملحوظة: على استضافات زي Railway، نظام الملفات بيتصفّر مع كل نشر جديد —
// لو حابب الصور تفضل موجودة دايمًا، الأفضل لاحقًا تنقلها لتخزين خارجي
// (زي S3 أو Cloudinary) بدل القرص المحلي.
export const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 ميجابايت

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (req: any, file, cb) => {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype] || path.extname(file.originalname) || '.jpg';
    // بنسمي الملف باستخدام userId + وقت الرفع عشان يكون فريد ومايتضاربش مع
    // مستخدمين تانيين، ومايسمحش لحد يحاول يخمن أو يستبدل صورة حد غيره.
    const uniqueName = `${req.userId}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
    cb(new Error('نوع الصورة لازم يكون JPG أو PNG أو WEBP أو GIF'));
    return;
  }
  cb(null, true);
}

// middleware جاهز يتحط على أي route محتاج يستقبل ملف واحد باسم الحقل "avatar"
export const avatarUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_AVATAR_BYTES },
}).single('avatar');

// بنمسح ملف الأفتار القديم من على القرص لما المستخدم يرفع صورة جديدة أو
// يشيل صورته، عشان مانسيبش ملفات يتيمة تتراكم على السيرفر بلا داعي.
export function deleteAvatarFile(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return;
  const filename = path.basename(avatarUrl);
  const filePath = path.join(AVATAR_DIR, filename);
  fs.unlink(filePath, () => {
    // لو الملف مش موجود أصلًا أو حصل خطأ في المسح، مفيش داعي نوقف العملية
    // الأساسية (تحديث/حذف الأفتار) بسبب كده.
  });
}
