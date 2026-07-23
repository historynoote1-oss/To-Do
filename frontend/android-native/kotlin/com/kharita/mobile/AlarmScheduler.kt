package com.kharita.mobile

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * مسؤول عن جدولة/إلغاء إنذارات الأذان عبر AlarmManager، وتخزينها في
 * SharedPreferences عشان AdhanBootReceiver يقدر يعيد جدولتها بعد
 * إعادة تشغيل الجهاز (لأن أندرويد بيمسح كل إنذارات AlarmManager
 * لما الجهاز يقفل ويفتح).
 */
object AlarmScheduler {
    private const val PREFS_NAME = "adhan_alarms_store"
    private const val KEY_ALARMS = "alarms_json"
    const val EXTRA_PRAYER_KEY = "prayer_key"
    const val EXTRA_PRAYER_LABEL = "prayer_label"
    const val EXTRA_SOUND_RES = "sound_res"
    const val EXTRA_REQUEST_ID = "request_id"

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** بيحل محل كل الإنذارات المجدولة سابقًا بالمجموعة الجديدة. */
    fun scheduleAll(context: Context, alarms: JSONArray) {
        cancelAll(context)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()

        for (i in 0 until alarms.length()) {
            val item = alarms.getJSONObject(i)
            val timestamp = item.getLong("timestamp")
            if (timestamp <= now) continue // متخطي أي وقت فات

            val requestId = timestamp.rem(Int.MAX_VALUE.toLong()).toInt()
            val intent = Intent(context, AdhanAlarmReceiver::class.java).apply {
                putExtra(EXTRA_PRAYER_KEY, item.optString("key"))
                putExtra(EXTRA_PRAYER_LABEL, item.optString("label"))
                putExtra(EXTRA_SOUND_RES, item.optString("soundResource", "adhan_default"))
                putExtra(EXTRA_REQUEST_ID, requestId)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                requestId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent)
                    } else {
                        // لو المستخدم ملغيش صلاحية "Alarms & reminders" هنستخدم بديل
                        // تقريبي (ممكن يتأخر بضع دقائق حسب Doze) أفضل من عدم التشغيل خالص.
                        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent)
                    }
                } else {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent)
                }
            } catch (_: SecurityException) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestamp, pendingIntent)
            }
        }

        prefs(context).edit().putString(KEY_ALARMS, alarms.toString()).apply()
    }

    fun cancelAll(context: Context) {
        val stored = getStoredAlarms(context)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (i in 0 until stored.length()) {
            val item = stored.getJSONObject(i)
            val timestamp = item.optLong("timestamp")
            val requestId = timestamp.rem(Int.MAX_VALUE.toLong()).toInt()
            val intent = Intent(context, AdhanAlarmReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                requestId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(pendingIntent)
        }
        prefs(context).edit().remove(KEY_ALARMS).apply()
    }

    fun getStoredAlarms(context: Context): JSONArray {
        val raw = prefs(context).getString(KEY_ALARMS, null) ?: return JSONArray()
        return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    }

    /** بتتنادى من AdhanBootReceiver بعد إعادة تشغيل الجهاز. */
    fun rescheduleFromStorage(context: Context) {
        val stored = getStoredAlarms(context)
        if (stored.length() > 0) {
            scheduleAll(context, stored)
        }
    }
}
