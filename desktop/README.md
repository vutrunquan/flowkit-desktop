# Flow Kit Desktop — Ứng dụng Desktop Đa Nền Tảng (Windows, macOS M-Chip & Intel)

Hệ thống ứng dụng Desktop trọn gói (All-in-One) cho **Flow Kit**, hỗ trợ hoạt động mượt mà trên **Windows (x64)** và **macOS (Apple Silicon M1/M2/M3/M4 & Intel x64)**.

Ứng dụng tự động khởi chạy giao diện điều khiển (Dashboard), quản lý vòng đời tiến trình Python FastAPI Backend, nạp Chrome Extension và kết nối phiên Google Flow trực tiếp ngay trên máy tính mà không cần gõ lệnh thủ công.

---

## 🌟 Tính Năng Nổi Bật

1. **Khởi động 1-Click đa nền tảng**:
   - **Windows**: Nhấp đúp `run_desktop.bat`.
   - **macOS**: Nhấp đúp `run_desktop.command` trong Finder hoặc chạy `./run_desktop.sh`.
   - Tự động nhận diện kiến trúc phần cứng: Apple Silicon (`arm64`) hay Intel (`x64`).
   - Tự động cấu hình biến môi trường `PATH` cho Homebrew (`/opt/homebrew` trên chip M, `/usr/local` trên Intel).
   - Tự động kiểm tra môi trường Python (`venv` hoặc hệ thống), tự động kích hoạt FastAPI Backend trên cổng `8100`.
   - Quản lý cây tiến trình (Process Tree), tự động tắt sạch tiến trình Python ngầm khi đóng ứng dụng trên cả Windows và macOS.

2. **Giao diện Dashboard Tích hợp**:
   - Chạy trực tiếp Dashboard quản lý dự án, cảnh quay, thư viện video trong cửa sổ Desktop native.
   - Kết nối WebSocket thời gian thực tới Backend (`ws://127.0.0.1:8100/ws/dashboard`).
   - Hỗ trợ đầy đủ phím tắt macOS (`Cmd+C`, `Cmd+V`, `Cmd+A`, `Cmd+X`) và Windows (`Ctrl+C`, `Ctrl+V`, `Ctrl+A`).

3. **Cửa sổ Google Flow Session**:
   - Phím tắt `Cmd+Shift+F` (macOS) hoặc `Ctrl+Shift+F` (Windows): Mở cửa sổ Google Flow ngay bên trong App với phiên đăng nhập được lưu trữ vĩnh viễn (`persist:flowkit_google`).
   - Cấu hình sẵn Chrome User-Agent để tránh bị Google chặn đăng nhập.
   - Tùy chọn mở trên trình duyệt Google Chrome ngoài nếu muốn.

4. **Tiện ích Tích hợp & Hệ Thống Menu Chuẩn**:
   - Phím tắt `Cmd+Shift+O` (macOS) hoặc `Ctrl+Shift+O` (Windows): Mở nhanh thư mục video xuất bản (`output/`).
   - Menu chuẩn macOS (Application Menu, Edit Menu, Window Menu).
   - Khởi động lại Backend nhanh từ Menu hệ thống.
   - Tự động nạp Chrome Extension cầu nối (`extension/`).

---

## 🚀 Cách Sử Dụng

### 1. Khởi chạy trên macOS (Apple Silicon M1/M2/M3/M4 & Intel)

#### Cách 1: Nhấp đúp chuột trong Finder (Khuyên dùng)
Nhấp đúp chuột vào file:
```
run_desktop.command
```
ngay tại thư mục gốc của dự án. File này sẽ mở Terminal, kiểm tra kiến trúc CPU (M-chip hay Intel), build Dashboard (nếu chưa có) và mở ứng dụng Flow Kit Desktop.

*Lưu ý lần đầu nếu macOS yêu cầu cấp quyền thực thi:*
```bash
chmod +x run_desktop.sh run_desktop.command
```

#### Cách 2: Chạy bằng Terminal
```bash
./run_desktop.sh
```

---

### 2. Khởi chạy trên Windows

Nhấp đúp chuột vào file:
```
run_desktop.bat
```
ngay tại thư mục gốc của dự án. File này sẽ tự kiểm tra môi trường ảo Python `venv`, bản build Dashboard và mở App Desktop ngay lập tức.

---

### 3. Chạy thủ công qua lệnh npm (Cho cả Win & Mac)

```bash
# 1. Di chuyển vào thư mục desktop
cd desktop

# 2. Khởi chạy ứng dụng
npm start
```

---

## 📦 Hướng Dẫn Đóng Gói Ứng Dụng (Build Installer & Binary)

Trong thư mục `desktop`:

### 🍏 Đóng gói cho macOS (DMG & ZIP)

```bash
# 1. Đóng gói cho Apple Silicon (Mac chip M1, M2, M3, M4):
npm run dist:mac:arm64

# 2. Đóng gói cho Mac Intel (x64):
npm run dist:mac:x64

# 3. Đóng gói bản Universal (Chạy trên cả chip M và Intel trong 1 file cài duy nhất):
npm run dist:mac:universal

# Hoặc đóng gói tự động cho máy Mac hiện tại:
npm run dist:mac
```

Sau khi hoàn tất, file `.dmg` và `.zip` sẽ nằm trong thư mục `desktop/release/`.

---

### 🪟 Đóng gói cho Windows (.exe)

```bash
# Đóng gói bản Portable (file .exe chạy ngay không cần cài đặt):
npm run dist:win:portable

# Đóng gói bộ cài đặt Windows (NSIS Setup .exe):
npm run dist:win:installer

# Hoặc chạy lệnh tổng quát:
npm run dist:win
```

Sau khi hoàn tất, file `.exe` sẽ nằm trong thư mục `desktop/release/`.
