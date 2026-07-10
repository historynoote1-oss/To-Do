# Todo Activity — دليل التشغيل من الموبايل

المشروع فيه مجلدين: `backend` (API + قاعدة بيانات) و `frontend` (الواجهة اللي هتفتح جوه Discord).

## 1) ارفع الكود على GitHub
1. افتح تطبيق GitHub أو الموقع من المتصفح، وسجل دخول.
2. اعمل Repository جديد (خليه Private).
3. فك ضغط الملف اللي بعتهولك، وارفع كل المجلدات (backend + frontend + README) عن طريق "Add file → Upload files".

## 2) استضافة الباك إند + قاعدة البيانات (Railway)
1. ادخل railway.app من المتصفح وسجل دخول بحساب GitHub.
2. New Project → Deploy from GitHub repo → اختار الريبو بتاعك.
3. من إعدادات الـ Service، حدد **Root Directory** = `backend`.
4. ضيف قاعدة بيانات: New → Database → PostgreSQL. Railway هيربط `DATABASE_URL` تلقائيًا للـ Service.
5. في تبويب Variables ضيف:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   (هتجيبهم من الخطوة 4 تحت)
6. في Settings، خلي:
   - Build Command: `npm run build`
   - Start Command: `npm start`
   - Deploy → بعد أول نجاح، افتح الـ Shell (تبويب داخل Railway) ونفذ: `npx prisma migrate deploy` (أو `npm run migrate`) عشان يعمل جداول قاعدة البيانات.
7. هتاخد رابط زي `https://your-backend.up.railway.app` — احفظه.

## 3) استضافة الفرونت إند (Vercel)
1. ادخل vercel.com وسجل دخول بحساب GitHub.
2. Add New → Project → اختار نفس الريبو.
3. Root Directory = `frontend`.
4. Framework Preset: Vite (بيتعرف تلقائي).
5. Environment Variables: ضيف `VITE_DISCORD_CLIENT_ID` (هتجيبه من الخطوة 4).
6. Deploy. هتاخد رابط زي `https://your-frontend.vercel.app`.

## 4) إعداد التطبيق في Discord Developer Portal
1. من الموبايل افتح discord.com/developers/applications.
2. New Application → سمّيه.
3. من General Information خد الـ **Application ID** (ده هو `DISCORD_CLIENT_ID`).
4. من OAuth2 → خد الـ **Client Secret** (ده هو `DISCORD_CLIENT_SECRET`). ارجع خطوة 2 و 6 وحط القيم دي.
5. من قايمة اليسار: Activities → Settings → فعّل **Enable Activities**.
6. حط **Target/Root Mapping**:
   - Root Mapping: رابط الفرونت إند بتاعك من Vercel (بدون https://).
   - URL Mapping: `/api` → رابط الباك إند بتاعك من Railway (بدون https://).
   هي دي اللي بتخلي `/.proxy/api/...` في الكود يوصل فعليًا للباك إند.
7. من OAuth2 → Redirects ضيف رابط الفرونت إند بتاعك.

## 5) التجربة
1. من تطبيق Discord على الموبايل، ادخل أي فويس تشانل في سيرفرك.
2. دوس على زرار الـ Activities (الصاروخ 🚀) جنب زرار الشات.
3. بما إن التطبيق لسه مش verified، هيظهرلك بس لو انت عضو في فريق التطبيق على Developer Portal — تأكد إنك مضاف Owner/Developer.
4. دوس عليه، هيفتح الـ Activity، وهيطلب منك صلاحية (OAuth) أول مرة، وبعدها هتظهر واجهة قائمة المهام.

## ملاحظات مهمة
- كل قائمة بتبقى خاصة باليوزر وبالسيرفر (guild) اللي فتح منه الـ Activity.
- التحقق من الهوية بيحصل عن طريق سؤال Discord نفسه بالـ access_token، مفيش تزوير ممكن لهوية اليوزر.
- لو غيرت الكود، كفاية تعمل `git push` تاني — Railway و Vercel بيعملوا Deploy تلقائي مع كل push.
