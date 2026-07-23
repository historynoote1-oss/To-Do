import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

// ============================================================================
// تخزين صور أيقونات مجالات الحياة — نفس فلسفة avatarUpload.ts بالظبط: لو
// متغيرات Cloudinary مظبوطة بيترفع هناك، وإلا بيرجع للتخزين المحلي تلقائيًا.
// ============================================================================

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY?.trim();
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET?.trim();

export const CLOUDINARY_ENABLED = Boolean(
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
);

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_ICON_BYTES = 2 * 1024 * 1024; // 2 ميجابايت — كفاية لأيقونة صغيرة

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
    cb(new Error('نوع الصورة لازم يكون JPG أو PNG أو WEBP أو GIF'));
    return;
  }
  cb(null, true);
}

export const LIFE_AREA_ICON_DIR = path.join(process.cwd(), 'uploads', 'life-area-icons');
if (!CLOUDINARY_ENABLED) {
  fs.mkdirSync(LIFE_AREA_ICON_DIR, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LIFE_AREA_ICON_DIR),
  filename: (req: any, file, cb) => {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype] || path.extname(file.originalname) || '.jpg';
    const uniqueName = `${req.params.id}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

const memoryStorage = multer.memoryStorage();

// middleware جاهز لاستقبال ملف واحد باسم الحقل "icon"
export const lifeAreaIconUpload = multer({
  storage: CLOUDINARY_ENABLED ? memoryStorage : diskStorage,
  fileFilter,
  limits: { fileSize: MAX_ICON_BYTES },
}).single('icon');

function cloudinarySign(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto
    .createHash('sha1')
    .update(toSign + CLOUDINARY_API_SECRET)
    .digest('hex');
}

function cloudinaryPublicId(lifeAreaId: string) {
  return `life-area-icons/${lifeAreaId}`;
}

export async function uploadLifeAreaIconToCloudinary(
  buffer: Buffer,
  mimetype: string,
  lifeAreaId: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = cloudinaryPublicId(lifeAreaId);
  const signature = cloudinarySign({
    invalidate: 'true',
    overwrite: 'true',
    public_id: publicId,
    timestamp,
  });

  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(buffer)], { type: mimetype }));
  form.append('api_key', CLOUDINARY_API_KEY!);
  form.append('timestamp', String(timestamp));
  form.append('public_id', publicId);
  form.append('overwrite', 'true');
  form.append('invalidate', 'true');
  form.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  );
  const data: any = await res.json();
  if (!res.ok) {
    console.error('[lifeAreaUpload] فشل الرفع على Cloudinary:', data?.error || data);
    throw new Error('تعذّر رفع الصورة دلوقتي، جرّب تاني كمان شوية 🙏');
  }
  return data.secure_url as string;
}

export async function deleteLifeAreaIconFromCloudinary(lifeAreaId: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = cloudinaryPublicId(lifeAreaId);
  const signature = cloudinarySign({ public_id: publicId, timestamp });

  const form = new FormData();
  form.append('public_id', publicId);
  form.append('api_key', CLOUDINARY_API_KEY!);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);

  try {
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
      method: 'POST',
      body: form,
    });
  } catch (err) {
    console.error('[lifeAreaUpload] فشل حذف الصورة القديمة من Cloudinary:', err);
  }
}

export function deleteLifeAreaIconFile(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  if (/^https?:\/\//.test(imageUrl)) return; // ملف على Cloudinary مش على القرص المحلي
  const filename = path.basename(imageUrl);
  const filePath = path.join(LIFE_AREA_ICON_DIR, filename);
  fs.unlink(filePath, () => {});
}
