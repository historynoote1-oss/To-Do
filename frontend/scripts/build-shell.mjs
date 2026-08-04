// بيبني dist/ بأقل شكل ممكن (نسخة من index.html بس). مفيش React ولا Vite
// هنا لأن التطبيق مش بيعرض أي كود محلي — Capacitor بيوجّه المستخدم مباشرة
// لرابط server.url الموجود في capacitor.config.ts (الموقع اللايف).
// الـ dist ده مجرد شرط شكلي عشان "npx cap sync android" يلاقي webDir موجود.

import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
copyFileSync(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));

console.log('[build-shell] تم إنشاء dist/index.html (نسخة فارغة — التطبيق بيشتغل على الرابط اللايف).');
