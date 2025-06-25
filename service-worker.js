// Tên cache, hãy thay đổi phiên bản (v1, v2,...) khi bạn cập nhật các tệp trong ứng dụng
const CACHE_NAME = 'gym-tracker-cache-v2';

// Danh sách các tệp cần được cache để ứng dụng hoạt động offline
const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  'app.js',
  'icons/icon-192x192.png',
  'icons/icon-512x512.png',
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg' // Biểu tượng Google
];

// Sự kiện 'install': được gọi khi service worker được cài đặt lần đầu
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Mở cache và thêm các tệp cốt lõi');
        return cache.addAll(urlsToCache);
      })
  );
});

// Sự kiện 'fetch': được gọi mỗi khi có một yêu cầu mạng từ ứng dụng
// Chiến lược: Cache First - Ưu tiên lấy từ cache trước, nếu không có mới lấy từ mạng
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Nếu tìm thấy trong cache, trả về ngay lập tức
        if (response) {
          return response;
        }

        // Nếu không có trong cache, thực hiện yêu cầu mạng
        return fetch(event.request);
      })
  );
});

// Sự kiện 'activate': được gọi khi service worker mới được kích hoạt
// Dọn dẹp các cache cũ không còn sử dụng
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Xóa cache cũ:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 