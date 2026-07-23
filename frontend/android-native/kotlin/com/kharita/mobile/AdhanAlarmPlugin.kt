package com.kharita.mobile

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray

/**
 * الجسر بين الواجهة (JS في prayerTimesStore.tsx) وبين الجدولة الحقيقية
 * على مستوى النظام. متاح للواجهة عبر:
 *   import { registerPlugin } from '@capacitor/core';
 *   const AdhanAlarm = registerPlugin('AdhanAlarm');
 */
@CapacitorPlugin(
    name = "AdhanAlarm",
    permissions = [
        Permission(strings = ["android.permission.POST_NOTIFICATIONS"], alias = "notifications")
    ]
)
class AdhanAlarmPlugin : Plugin() {

    // بيطلب صلاحية إظهار الإشعارات (لازمة من Android 13+ عشان إشعار
    // الأذان Full-screen يظهر؛ الصوت نفسه بيشتغل حتى من غيرها).
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
            val result = JSObject()
            result.put("granted", true)
            call.resolve(result)
        } else {
            requestPermissionForAlias("notifications", call, "onNotificationPermissionResult")
        }
    }

    @PermissionCallback
    private fun onNotificationPermissionResult(call: PluginCall) {
        val result = JSObject()
        result.put("granted", getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED)
        call.resolve(result)
    }

    // scheduleAlarms({ alarms: [{ key, label, timestamp, soundResource }] })
    @PluginMethod
    fun scheduleAlarms(call: PluginCall) {
        val alarmsInput: JSArray = call.getArray("alarms") ?: JSArray()
        val jsonArray = JSONArray(alarmsInput.toString())
        AlarmScheduler.scheduleAll(context, jsonArray)
        val result = JSObject()
        result.put("scheduled", jsonArray.length())
        call.resolve(result)
    }

    @PluginMethod
    fun cancelAlarms(call: PluginCall) {
        AlarmScheduler.cancelAll(context)
        call.resolve()
    }

    // بيرجع true لو التطبيق يقدر يجدول إنذار دقيق (Android 12+ محتاج صلاحية خاصة)
    @PluginMethod
    fun canScheduleExactAlarms(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            result.put("value", alarmManager.canScheduleExactAlarms())
        } else {
            result.put("value", true)
        }
        call.resolve(result)
    }

    // بيفتح شاشة إعدادات النظام عشان المستخدم يفعّل "Alarms & reminders" يدويًا
    @PluginMethod
    fun openExactAlarmSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                data = Uri.parse("package:" + context.packageName)
            }
            activity.startActivity(intent)
        }
        call.resolve()
    }

    // بيفتح شاشة استثناء تحسين البطارية عشان النظام ميوقفش التطبيق في الخلفية
    @PluginMethod
    fun openBatteryOptimizationSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:" + context.packageName)
            }
            activity.startActivity(intent)
        } catch (_: Exception) {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            activity.startActivity(intent)
        }
        call.resolve()
    }

    // بيفتح شاشة صلاحية "Do Not Disturb access" عشان الأذان يتخطى وضع عدم الإزعاج فعليًا
    @PluginMethod
    fun openDndAccessSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
        activity.startActivity(intent)
        call.resolve()
    }
}
