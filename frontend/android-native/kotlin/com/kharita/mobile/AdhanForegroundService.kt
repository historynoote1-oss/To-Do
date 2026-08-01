package com.kharita.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.CountDownTimer
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * الخدمة دي هي اللي فعليًا "توقف كل حاجة" وتشغّل الأذان:
 * - بتشغّل الصوت على STREAM_ALARM (بيتخطى وضع "صامت"، وبيتخطى وضع
 *   "اهتزاز فقط"؛ ما بيتخطاش كتم صوت المنبهات نفسه لو المستخدم قافل
 *   قناة المنبهات يدويًا من إعدادات الجهاز).
 * - بتطلع إشعار Full-screen (زي منبّه الساعة بالظبط) حتى لو الشاشة مقفولة.
 * - بتاخد WakeLock مؤقت عشان تضمن إن المعالج ما يرجعش نايم قبل ما
 *   الصوت يخلص.
 */
class AdhanForegroundService : Service() {

    private var mediaPlayer: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var autoStopTimer: CountDownTimer? = null

    companion object {
        const val CHANNEL_ID = "adhan_alarm_channel"
        const val NOTIFICATION_ID = 7711
        const val ACTION_STOP = "com.kharita.mobile.ACTION_STOP_ADHAN"
        // أقصى مدة تشغيل قبل الإيقاف التلقائي (الأذان عادة 3-4 دقايق)
        private const val MAX_DURATION_MS = 5 * 60 * 1000L
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelfCleanly()
            return START_NOT_STICKY
        }

        val prayerLabel = intent?.getStringExtra(AlarmScheduler.EXTRA_PRAYER_LABEL) ?: "الصلاة"
        val soundRes = intent?.getStringExtra(AlarmScheduler.EXTRA_SOUND_RES) ?: "adhan_default"

        createChannel()
        val notification = buildNotification(prayerLabel)
        startForeground(NOTIFICATION_ID, notification)

        acquireWakeLock()
        playAdhan(soundRes)

        autoStopTimer = object : CountDownTimer(MAX_DURATION_MS, MAX_DURATION_MS) {
            override fun onTick(millisUntilFinished: Long) {}
            override fun onFinish() { stopSelfCleanly() }
        }.start()

        return START_NOT_STICKY
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                val audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "تنبيه الأذان",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "إشعار وصوت الأذان في مواقيت الصلاة"
                    enableVibration(true)
                    setBypassDnd(true) // يحتاج المستخدم يفعّل صلاحية "Do Not Disturb access" يدويًا
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    // الصوت الفعلي بيتشغل يدويًا عبر MediaPlayer عشان نتحكم في وقف/تشغيل،
                    // فمش بنربطه بالقناة هنا لتفادي تشغيل مزدوج.
                    setSound(null, audioAttributes)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    private fun buildNotification(prayerLabel: String): android.app.Notification {
        val stopIntent = Intent(this, AdhanForegroundService::class.java).apply { action = ACTION_STOP }
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentPendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("حان وقت $prayerLabel")
            .setContentText("اضغط لإيقاف الأذان")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(contentPendingIntent, true)
            .setContentIntent(contentPendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "إيقاف الأذان", stopPendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .build()
    }

    private val prepareTimeoutHandler = Handler(Looper.getMainLooper())

    /**
     * soundResource ممكن يكون:
     * - رابط https كامل (نفس رابط القارئ اللي المستخدم مختاره في الموقع، من
     *   cdn.aladhan.com) — وده الوضع الافتراضي، فمفيش داعي نضيف ملفات صوت
     *   إضافية جوه الـ APK.
     * - اسم مصدر raw محلي (لو حد ضاف ملف مستقبلًا في res/raw).
     * - "silent" — من غير صوت خالص، بس الإشعار Full-screen بيفضل يشتغل.
     */
    private fun playAdhan(soundResource: String) {
        if (soundResource == "silent") return
        try {
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                setAudioStreamType(AudioManager.STREAM_ALARM) // توافق للإصدارات الأقدم

                if (soundResource.startsWith("http")) {
                    setDataSource(soundResource)
                } else {
                    val resId = resources.getIdentifier(soundResource, "raw", packageName)
                    if (resId != 0) {
                        val afd = resources.openRawResourceFd(resId)
                        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                        afd.close()
                    } else {
                        setDataSource(this@AdhanForegroundService, defaultAlarmUri())
                    }
                }

                isLooping = false
                setOnCompletionListener { stopSelfCleanly() }
                setOnErrorListener { _, _, _ -> playFallbackSound(); true }
                setOnPreparedListener {
                    prepareTimeoutHandler.removeCallbacksAndMessages(null)
                    it.start()
                }
                prepareAsync() // async لازم للستريمنج من رابط، تفادي تجميد الـ Service

                // لو الرابط بطيء أو النت مقطوع، متستناش أكتر من 8 ثواني قبل ما
                // ترجع لصوت المنبّه الافتراضي — الأولوية إن المستخدم يسمع حاجة.
                prepareTimeoutHandler.postDelayed({
                    if (mediaPlayer?.isPlaying != true) playFallbackSound()
                }, 8000)
            }
        } catch (_: Exception) {
            playFallbackSound()
        }
    }

    private fun playFallbackSound() {
        try {
            mediaPlayer?.release()
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(this@AdhanForegroundService, defaultAlarmUri())
                isLooping = true
                setOnPreparedListener { it.start() }
                prepareAsync()
            }
        } catch (_: Exception) {
            // مفيش أي مصدر صوت متاح؛ الإشعار Full-screen يفضل هو الضمانة الأخيرة.
        }
    }

    private fun defaultAlarmUri() =
        RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getValidRingtoneUri(this)

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "kharita:adhan_wakelock"
        ).apply {
            setReferenceCounted(false)
            acquire(6 * 60 * 1000L) // حد أقصى 6 دقايق كحماية إضافية
        }
    }

    private fun stopSelfCleanly() {
        autoStopTimer?.cancel()
        prepareTimeoutHandler.removeCallbacksAndMessages(null)
        try { mediaPlayer?.stop() } catch (_: Exception) {}
        mediaPlayer?.release()
        mediaPlayer = null
        if (wakeLock?.isHeld == true) wakeLock?.release()
        // stopForeground(Int) بقيمة STOP_FOREGROUND_REMOVE متاحة بس من API 33،
        // وminSdk بتاعنا 24، فلازم نفرّق بين الإصدارين وإلا هيحصل NoSuchMethodError
        // على الأجهزة الأقدم.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        stopSelfCleanly()
        super.onDestroy()
    }
}
