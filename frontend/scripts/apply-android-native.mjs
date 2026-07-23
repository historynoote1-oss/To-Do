// بيتنفذ في الـ CI بعد "npx cap sync android" مباشرة. شغله إنه "يلزّق"
// كود الأذان الـ Native (Kotlin + Manifest) فوق مشروع android/ اللي
// Capacitor بيولّده من الصفر كل مرة. عملناه بالشكل ده (overlay) بدل ما
// نثبّت مجلد android/ كامل في الريبو، عشان نتجنب مشاكل توافق نسخ
// Gradle/AGP لما Capacitor يتحدّث، وبرضه يفضل الكود الـ Native ده موجود
// دايمًا وميتمسحش.
//
// الأمان: السكريبت idempotent - لو اتنفذ أكتر من مرة على نفس المشروع
// مش هيكرر الإضافات (بيدور على علامات مميزة قبل ما يضيف حاجة).

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..');
const NATIVE_SRC = path.join(FRONTEND_DIR, 'android-native');
const ANDROID_DIR = path.join(FRONTEND_DIR, 'android');
const PACKAGE_PATH = 'com/kharita/mobile';

function fail(msg) {
  console.error(`[apply-android-native] خطأ: ${msg}`);
  process.exit(1);
}

if (!existsSync(ANDROID_DIR)) {
  fail(`مجلد android/ مش موجود. شغّل "npx cap sync android" الأول.`);
}

// 1) نسخ ملفات Kotlin
const kotlinDestDir = path.join(ANDROID_DIR, 'app', 'src', 'main', 'java', PACKAGE_PATH);
mkdirSync(kotlinDestDir, { recursive: true });
const kotlinSrcDir = path.join(NATIVE_SRC, 'kotlin', PACKAGE_PATH);
for (const file of readdirSync(kotlinSrcDir)) {
  copyFileSync(path.join(kotlinSrcDir, file), path.join(kotlinDestDir, file));
  console.log(`[apply-android-native] نسخ ${file}`);
}

// 2) نسخ أي ملفات صوت في res/raw (لو موجودة)
const rawSrcDir = path.join(NATIVE_SRC, 'res', 'raw');
const rawDestDir = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res', 'raw');
if (existsSync(rawSrcDir)) {
  const files = readdirSync(rawSrcDir).filter((f) => !f.startsWith('.') && f !== 'README.md');
  if (files.length > 0) {
    mkdirSync(rawDestDir, { recursive: true });
    for (const file of files) {
      copyFileSync(path.join(rawSrcDir, file), path.join(rawDestDir, file));
      console.log(`[apply-android-native] نسخ صوت ${file}`);
    }
  } else {
    console.warn('[apply-android-native] تحذير: مفيش ملف صوت أذان في frontend/android-native/res/raw — الخدمة هتشتغل بدون صوت لحد ما يتضاف ملف adhan_default.mp3');
  }
}

// 3) تعديل AndroidManifest.xml
const manifestPath = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
if (!existsSync(manifestPath)) fail('AndroidManifest.xml مش موجود');
let manifest = readFileSync(manifestPath, 'utf8');

// 3-أ) الصلاحيات: بنتحقق من كل سطر صلاحية لوحده (مش من علامة واحدة عامة)،
// عشان لو ضفنا صلاحية جديدة لاحقًا (زي الموقع الجغرافي) تتضاف تلقائي حتى
// لو مجلد android/ موجود بالفعل من بيلد قديم كانت فيه صلاحيات أذان بس.
const PERMISSIONS_MARKER = '<!-- adhan-native:permissions -->';
const permissionLines = readFileSync(path.join(NATIVE_SRC, 'manifest-permissions.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);
const missingPermissions = permissionLines.filter((line) => !manifest.includes(line));

if (missingPermissions.length > 0) {
  const needsMarker = !manifest.includes(PERMISSIONS_MARKER);
  const block = (needsMarker ? `${PERMISSIONS_MARKER}\n` : '') + missingPermissions.join('\n');
  manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n${block}`);
  writeFileSync(manifestPath, manifest, 'utf8');
  console.log(`[apply-android-native] تم إضافة ${missingPermissions.length} صلاحية ناقصة إلى AndroidManifest.xml`);
} else {
  console.log('[apply-android-native] كل الصلاحيات موجودة بالفعل، تخطي');
}

// 3-ب) الـ receivers/service: علامة مستقلة تمامًا عن علامة الصلاحيات،
// عشان إضافة صلاحية جديدة فوق ميوقفش إضافة الـ components لو دي أول مرة.
// وبنتأكد كمان إن الأسماء نفسها مش موجودة قبل كده (لو الملف اتعدّل بنسخة
// قديمة من السكربت بعلامة مختلفة)، عشان مانكررش الـ receivers ونعمل خطأ
// بناء بسبب تعريف مكرر لنفس الاسم.
const COMPONENTS_MARKER = '<!-- adhan-native:components -->';
const componentsRaw = readFileSync(path.join(NATIVE_SRC, 'manifest-components.txt'), 'utf8');
const componentNames = [...componentsRaw.matchAll(/android:name="([^"]+)"/g)].map((m) => m[1]);
const componentsAlreadyPresent =
  componentNames.length > 0 && componentNames.every((name) => manifest.includes(`android:name="${name}"`));

if (!manifest.includes(COMPONENTS_MARKER) && !componentsAlreadyPresent) {
  manifest = manifest.replace(
    /(<\/application>)/,
    `${COMPONENTS_MARKER}\n${componentsRaw}\n$1`
  );
  writeFileSync(manifestPath, manifest, 'utf8');
  console.log('[apply-android-native] تم إضافة الـ receivers/service إلى AndroidManifest.xml');
} else {
  console.log('[apply-android-native] الـ receivers/service موجودة بالفعل، تخطي');
}

// 4) تسجيل البلجن في MainActivity (Capacitor بيولّدها Java عادةً)
const mainActivityJava = path.join(
  ANDROID_DIR, 'app', 'src', 'main', 'java', PACKAGE_PATH, 'MainActivity.java'
);
const mainActivityKt = path.join(
  ANDROID_DIR, 'app', 'src', 'main', 'java', PACKAGE_PATH, 'MainActivity.kt'
);
const mainActivityPath = existsSync(mainActivityJava)
  ? mainActivityJava
  : existsSync(mainActivityKt)
    ? mainActivityKt
    : null;

if (!mainActivityPath) {
  fail('MainActivity مش موجودة (لا Java ولا Kotlin)');
}

let mainActivity = readFileSync(mainActivityPath, 'utf8');
const REG_MARKER = 'adhan-native:registerPlugin';

if (!mainActivity.includes(REG_MARKER)) {
  if (mainActivityPath.endsWith('.java')) {
    if (!mainActivity.includes('import com.getcapacitor.BridgeActivity')) {
      fail('شكل MainActivity.java غير متوقع، عدّله يدويًا');
    }
    mainActivity = mainActivity.replace(
      'public class MainActivity extends BridgeActivity {',
      `public class MainActivity extends BridgeActivity {\n  // ${REG_MARKER}\n  @Override\n  public void onCreate(android.os.Bundle savedInstanceState) {\n    registerPlugin(AdhanAlarmPlugin.class);\n    super.onCreate(savedInstanceState);\n  }`
    );
  } else {
    mainActivity = mainActivity.replace(
      /class MainActivity\s*:\s*BridgeActivity\s*\(\)\s*\{?/,
      (m) => `${m.includes('{') ? m : m + ' {'}\n    // ${REG_MARKER}\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        registerPlugin(AdhanAlarmPlugin::class.java)\n        super.onCreate(savedInstanceState)\n    }`
    );
  }
  writeFileSync(mainActivityPath, mainActivity, 'utf8');
  console.log(`[apply-android-native] تم تسجيل AdhanAlarmPlugin في ${path.basename(mainActivityPath)}`);
} else {
  console.log('[apply-android-native] البلجن متسجل بالفعل في MainActivity، تخطي');
}

// 5) تفعيل دعم Kotlin على مستوى المشروع (القالب الافتراضي لـ Capacitor
//    بيولّد MainActivity.java بس، من غير إعدادات Kotlin، وكل ملفاتنا
//    الـ Native مكتوبة Kotlin).
const KOTLIN_VERSION = '1.9.24';

const rootBuildGradlePath = path.join(ANDROID_DIR, 'build.gradle');
if (existsSync(rootBuildGradlePath)) {
  let rootBuildGradle = readFileSync(rootBuildGradlePath, 'utf8');
  if (!rootBuildGradle.includes('kotlin-gradle-plugin')) {
    rootBuildGradle = rootBuildGradle.replace(
      /(classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"])/,
      `$1\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}"`
    );
    writeFileSync(rootBuildGradlePath, rootBuildGradle, 'utf8');
    console.log('[apply-android-native] تم إضافة Kotlin Gradle Plugin لملف android/build.gradle');
  } else {
    console.log('[apply-android-native] Kotlin Gradle Plugin موجود بالفعل، تخطي');
  }
} else {
  console.warn('[apply-android-native] تحذير: android/build.gradle مش موجود');
}

// 6) التأكد من وجود androidx.core (NotificationCompat) في app/build.gradle
const appBuildGradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle');
if (existsSync(appBuildGradlePath)) {
  let buildGradle = readFileSync(appBuildGradlePath, 'utf8');

  if (!buildGradle.includes("apply plugin: 'kotlin-android'")) {
    buildGradle = buildGradle.replace(
      /apply plugin: ['"]com\.android\.application['"]/,
      (m) => `${m}\napply plugin: 'kotlin-android'`
    );
    console.log('[apply-android-native] تم تفعيل kotlin-android plugin في app/build.gradle');
  } else {
    console.log('[apply-android-native] kotlin-android plugin مفعّل بالفعل، تخطي');
  }

  const DEP_MARKER = 'androidx.core:core-ktx';
  if (!buildGradle.includes(DEP_MARKER)) {
    buildGradle = buildGradle.replace(
      /dependencies\s*\{/,
      `dependencies {\n    implementation "androidx.core:core-ktx:1.13.1"\n    implementation "org.jetbrains.kotlin:kotlin-stdlib:${KOTLIN_VERSION}"`
    );
    console.log('[apply-android-native] تم إضافة تبعيات Kotlin/androidx.core لملف app/build.gradle');
  } else {
    console.log('[apply-android-native] التبعيات موجودة بالفعل، تخطي');
  }

  writeFileSync(appBuildGradlePath, buildGradle, 'utf8');
} else {
  console.warn('[apply-android-native] تحذير: app/build.gradle مش موجود، متأكدش من التبعيات');
}

console.log('[apply-android-native] تم بنجاح ✅');
