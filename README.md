# kharita — App Shell فقط (بدون كود الموقع)

الريبو ده اتفضّى بالكامل من كل كود الواجهة (React) والباك إند، وفضل بس
الملفات اللي بتخلي التطبيق (APK) يفتح موقعك اللايف مباشرة جوه WebView.

## اللي اتمسح بالكامل
- `backend/` (كل الـ API والداتابيز)
- `frontend/src/` (كل كود React)
- `frontend/public/` (أيقونات/مانيفست الويب القديمة)
- `vite.config.ts`, `tsconfig.json`, `vercel.json`
- تبعيات React / Vite / socket.io / lucide-react من package.json

## اللي فضل (App Shell)
- `frontend/capacitor.config.ts` — فيه رابط موقعك اللايف (`server.url`)
- `frontend/android-native/` — أيقونات التطبيق + كود الأذان الـ Native (Kotlin)
  + صفحة الأوفلاين
- `frontend/scripts/apply-android-native.mjs` — بيلزّق android-native/ فوق
  مشروع android/ اللي Capacitor بيولّده
- `frontend/scripts/build-shell.mjs` — بديل بسيط لـ Vite، بينسخ index.html
  فاضي جوه dist/ بس (شرط شكلي عشان Capacitor يشتغل)
- `frontend/index.html` — صفحة فاضية (مش هتظهر عمليًا، لأن التطبيق بيتحول
  على اللايف URL على طول)
- `frontend/package.json` — تبعيات Capacitor بس

## خطوات البناء من الصفر
```bash
cd frontend
npm install
npm run build              # بيعمل dist/index.html فاضي
npx cap add android        # بيولّد مجلد android/ من الصفر
npx cap sync android
npm run android:apply-native
npx cap open android       # يفتح Android Studio لعمل APK/Build
```

## تنبيه مهم
- الملف `vercel.json` اتمسح، يعني الريبو ده بقى **مش** هو اللي بينشر
  موقعك اللايف على Vercel. لو نشرك للموقع كان بيتم من نفس الريبو ده،
  لازم يبقى عندك نسخة تانية منفصلة لكود الموقع نفسه (اللي فيها src/
  والباك إند)، وإلا مش هتقدر تعمل تحديث للموقع تاني.
- تأكد إن `server.url` في `capacitor.config.ts` مظبوط على رابط موقعك
  الصحيح قبل ما تبني APK.
