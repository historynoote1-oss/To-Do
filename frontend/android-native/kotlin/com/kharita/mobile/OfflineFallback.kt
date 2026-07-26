package com.kharita.mobile

import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebViewClient

// التطبيق شغال بوضع "Live URL" (شوف التعليق في capacitor.config.ts): الـ
// WebView بيحاول يفتح موقع الويب المنشور (Vercel) مباشرة في كل مرة، عشان
// أي تحديث للواجهة يظهر فورًا من غير ما نحتاج ننزل APK جديد. المشكلة إن
// لو الجهاز مفيش عليه نت خالص وقت الفتح، مفيش أي نسخة محلية للتطبيق أصلاً،
// فنظام أندرويد (الـ WebView الأصلي) هو اللي بيطلّع صفحة الخطأ البيضا
// الافتراضية بتاعته (net::ERR_INTERNET_DISCONNECTED) قبل ما كودنا يشتغل
// خالص.
//
// هنا بنلقط الفشل ده على مستوى الـ WebView ونحمّل بدله صفحة أوفلاين محلية
// (assets/offline.html) بتصميم يشبه هوية التطبيق، بدل صفحة خطأ النظام.
// الصفحة دي ملف ثابت متغلّف جوه التطبيق من أول تثبيت، فمش بتحتاج أي بناء
// APK جديد حتى لو الواجهة على Vercel اتغيّرت — التحديثات اللحظية لسه شغالة
// زي ما هي بالظبط.
object OfflineFallback {

    // نفس رابط السيرفر المضبوط في capacitor.config.ts (server.url). لو
    // غيّرت الرابط هناك يومًا ما، غيّره هنا كمان عشان زرار "إعادة المحاولة"
    // في offline.html يرجّع للمكان الصحيح.
    const val LIVE_URL = "https://kharita.vercel.app/"
    private const val OFFLINE_PAGE = "file:///android_asset/offline.html"

    @JvmStatic
    fun attach(bridge: Bridge) {
        val webView = bridge.webView

        webView.webViewClient = object : BridgeWebViewClient(bridge) {

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                // بنتجاهل فشل أي طلبات فرعية (صور، خطوط، سكريبتات...) ونتعامل
                // بس مع فشل تحميل الصفحة الرئيسية نفسها — وبنتأكد إننا مش
                // أصلاً واقفين على صفحة الأوفلاين (تجنّبًا لأي حلقة تحميل).
                if (request.isForMainFrame && view.url != OFFLINE_PAGE) {
                    view.loadUrl(OFFLINE_PAGE)
                } else if (!request.isForMainFrame) {
                    super.onReceivedError(view, request, error)
                }
            }
        }
    }
}
