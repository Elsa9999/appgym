# 🚀 Hướng dẫn triển khai Gym Workout Tracker

## 📋 Chuẩn bị

Trước khi triển khai, hãy đảm bảo:
- ✅ Có tài khoản GitHub
- ✅ Có tài khoản Vercel (tùy chọn)
- ✅ Code đã được commit và push lên repository

## 🌐 GitHub Pages (Miễn phí)

### Bước 1: Tạo Repository trên GitHub

1. Đăng nhập vào GitHub
2. Click "New repository"
3. Đặt tên: `gym-workout-tracker` (hoặc tên bạn muốn)
4. Chọn "Public"
5. Không tích "Add a README file" (vì đã có)
6. Click "Create repository"

### Bước 2: Push code lên GitHub

```bash
# Thêm remote origin (thay YOUR_USERNAME và REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Push code lên GitHub
git branch -M main
git push -u origin main
```

### Bước 3: Kích hoạt GitHub Pages

1. Vào repository trên GitHub
2. Click tab "Settings"
3. Scroll xuống phần "Pages" (bên trái)
4. Trong "Source", chọn "Deploy from a branch"
5. Chọn branch "main"
6. Chọn folder "/ (root)"
7. Click "Save"

### Bước 4: Truy cập website

Sau vài phút, website sẽ có sẵn tại:
```
https://YOUR_USERNAME.github.io/REPO_NAME
```

## ⚡ Vercel (Nhanh và mạnh mẽ)

### Bước 1: Đăng ký Vercel

1. Truy cập [vercel.com](https://vercel.com)
2. Đăng ký bằng tài khoản GitHub
3. Authorize Vercel truy cập repositories

### Bước 2: Import Project

1. Click "New Project"
2. Chọn repository `gym-workout-tracker`
3. Vercel sẽ tự động detect đây là static site
4. Click "Deploy"

### Bước 3: Cấu hình (Tùy chọn)

- **Custom Domain**: Thêm domain riêng
- **Environment Variables**: Nếu cần
- **Build Settings**: Không cần thay đổi cho static site

### Bước 4: Truy cập

Website sẽ có sẵn ngay lập tức tại:
```
https://REPO_NAME.vercel.app
```

## 🔄 Tự động triển khai

### GitHub Pages
- Tự động deploy khi push lên branch main
- Có thể mất 1-5 phút để cập nhật

### Vercel
- Tự động deploy khi push lên bất kỳ branch nào
- Preview deployments cho pull requests
- Cập nhật ngay lập tức

## 📱 PWA Features

Sau khi triển khai, ứng dụng sẽ có:
- ✅ Cài đặt trên thiết bị
- ✅ Hoạt động offline
- ✅ Icon và splash screen
- ✅ HTTPS (tự động với Vercel)

## 🛠️ Troubleshooting

### GitHub Pages không hoạt động
1. Kiểm tra Settings > Pages đã được kích hoạt
2. Đảm bảo file `index.html` ở root directory
3. Chờ 5-10 phút để deploy

### Vercel lỗi
1. Kiểm tra build logs
2. Đảm bảo tất cả file cần thiết đã được commit
3. Kiểm tra console trong browser

### PWA không cài được
1. Đảm bảo HTTPS (Vercel tự động)
2. Kiểm tra manifest.json và service-worker.js
3. Clear cache và reload

## 📞 Hỗ trợ

Nếu gặp vấn đề:
- GitHub Issues: Tạo issue trong repository
- Vercel Support: [vercel.com/support](https://vercel.com/support)
- Documentation: Đọc README.md

---

**Lưu ý**: Cả GitHub Pages và Vercel đều miễn phí cho personal projects. Vercel có thêm features như custom domains, analytics, và team collaboration. 