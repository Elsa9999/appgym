# PowerShell Script for Gym Workout Tracker Deployment
# Chạy script này sau khi đã tạo repository trên GitHub

param(
    [Parameter(Mandatory=$true)]
    [string]$GitHubUsername,
    
    [Parameter(Mandatory=$true)]
    [string]$RepositoryName
)

Write-Host "🚀 Bắt đầu triển khai Gym Workout Tracker..." -ForegroundColor Green

# Kiểm tra Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git chưa được cài đặt. Vui lòng cài đặt Git trước." -ForegroundColor Red
    exit 1
}

# Kiểm tra xem đã có remote origin chưa
$remoteOrigin = git remote get-url origin 2>$null
if ($remoteOrigin) {
    Write-Host "⚠️  Đã có remote origin: $remoteOrigin" -ForegroundColor Yellow
    $response = Read-Host "Bạn có muốn thay thế không? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        git remote remove origin
    } else {
        Write-Host "❌ Hủy triển khai." -ForegroundColor Red
        exit 1
    }
}

# Thêm remote origin
$remoteUrl = "https://github.com/$GitHubUsername/$RepositoryName.git"
Write-Host "📡 Thêm remote origin: $remoteUrl" -ForegroundColor Blue
git remote add origin $remoteUrl

# Kiểm tra kết nối
Write-Host "🔍 Kiểm tra kết nối đến GitHub..." -ForegroundColor Blue
try {
    git ls-remote origin >$null 2>&1
    Write-Host "✅ Kết nối thành công!" -ForegroundColor Green
} catch {
    Write-Host "❌ Không thể kết nối đến repository. Kiểm tra:" -ForegroundColor Red
    Write-Host "   - Repository đã được tạo trên GitHub" -ForegroundColor Red
    Write-Host "   - Tên repository và username chính xác" -ForegroundColor Red
    Write-Host "   - Quyền truy cập repository" -ForegroundColor Red
    exit 1
}

# Đổi tên branch thành main
Write-Host "🔄 Đổi tên branch thành main..." -ForegroundColor Blue
git branch -M main

# Push code lên GitHub
Write-Host "📤 Push code lên GitHub..." -ForegroundColor Blue
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Push thành công!" -ForegroundColor Green
    
    # Hiển thị thông tin tiếp theo
    Write-Host ""
    Write-Host "🎉 Triển khai thành công!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Bước tiếp theo:" -ForegroundColor Yellow
    Write-Host "1. Truy cập: https://github.com/$GitHubUsername/$RepositoryName" -ForegroundColor White
    Write-Host "2. Vào Settings > Pages" -ForegroundColor White
    Write-Host "3. Chọn Source: Deploy from a branch" -ForegroundColor White
    Write-Host "4. Chọn Branch: main" -ForegroundColor White
    Write-Host "5. Click Save" -ForegroundColor White
    Write-Host ""
    Write-Host "🌐 Website sẽ có sẵn tại:" -ForegroundColor Cyan
    Write-Host "   https://$GitHubUsername.github.io/$RepositoryName" -ForegroundColor White
    Write-Host ""
    Write-Host "⏰ Có thể mất 1-5 phút để website hoạt động." -ForegroundColor Yellow
} else {
    Write-Host "❌ Push thất bại. Kiểm tra lỗi ở trên." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "💡 Tip: Để triển khai lên Vercel:" -ForegroundColor Cyan
Write-Host "1. Truy cập https://vercel.com" -ForegroundColor White
Write-Host "2. Import repository từ GitHub" -ForegroundColor White
Write-Host "3. Click Deploy" -ForegroundColor White 