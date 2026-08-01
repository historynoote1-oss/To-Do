package com.kharita.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * بيتم استدعاؤه بواسطة AlarmManager بالظبط في معاد الصلاة، حتى لو
 * التطبيق مقفول تمامًا أو الجهاز في وضع Doze. شغله الوحيد إنه يشغّل
 * AdhanForegroundService اللي هو المسؤول الفعلي عن تشغيل الصوت
 * والإشعار (Foreground Service مطلوب عشان أندرويد يسمح للتشغيل
 * الصوتي الطويل نسبيًا من غير ما النظام يقتل البروسيس).
 */
class AdhanAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val serviceIntent = Intent(context, AdhanForegroundService::class.java).apply {
            putExtra(AlarmScheduler.EXTRA_PRAYER_KEY, intent.getStringExtra(AlarmScheduler.EXTRA_PRAYER_KEY))
            putExtra(AlarmScheduler.EXTRA_PRAYER_LABEL, intent.getStringExtra(AlarmScheduler.EXTRA_PRAYER_LABEL))
            putExtra(AlarmScheduler.EXTRA_SOUND_RES, intent.getStringExtra(AlarmScheduler.EXTRA_SOUND_RES))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
