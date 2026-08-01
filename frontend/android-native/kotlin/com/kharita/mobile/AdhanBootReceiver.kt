package com.kharita.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * أندرويد بيمسح كل إنذارات AlarmManager تلقائيًا لما الجهاز يتقفل
 * ويتفتح. الـ Receiver ده بيسمع لحدث BOOT_COMPLETED (والتحديثات
 * المشابهة) ويعيد جدولة نفس الإنذارات المخزّنة من آخر مرة الواجهة
 * بعتت فيها المواقيت.
 */
class AdhanBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            AlarmScheduler.rescheduleFromStorage(context)
        }
    }
}
