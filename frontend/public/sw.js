// Service Worker مخصّص لإشعارات الجهاز (Web Push) بتاعة نظام التذكيرات.
// بسيط عن قصد: مفيش تخزين مؤقت (caching) هنا، الهدف الوحيد إنه يفضل شغال
// في الخلفية عشان يستقبل push events ويعرض إشعار حتى لو المتصفح/التاب مقفول.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: '🔔 تذكير بمهمة', body: 'عندك مهمة محتاجة انتباهك', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // لو الجسم مش JSON صالح، بنسيب القيم الافتراضية
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'todo-reminder',
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url || '/' },
      vibrate: [120, 60, 120],
    })
  );
});

// لما المستخدم يدوس على الإشعار، بنفتحله تاب موجود لو لقينا واحد، وإلا
// بنفتح تاب جديد على الموقع.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
