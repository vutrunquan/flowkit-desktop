#!/usr/bin/env bash
# ==============================================================================
# Flow Kit Desktop Launcher for macOS (Apple Silicon M-chip & Intel) and Linux
# ==============================================================================

set -e

# Change directory to project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 0. Platform & Architecture Detection ───────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "========================================================"
echo "              FLOW KIT DESKTOP LAUNCHER"
echo "========================================================"

if [[ "$OS" == "Darwin" ]]; then
    if [[ "$ARCH" == "arm64" ]]; then
        echo "Detected: macOS Apple Silicon (M-Chip: $ARCH)"
    else
        echo "Detected: macOS Intel ($ARCH)"
    fi

    # Ensure Homebrew paths are in PATH for both M-Chip (/opt/homebrew) and Intel (/usr/local)
    if [ -d "/opt/homebrew/bin" ]; then
        export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
    fi
    if [ -d "/usr/local/bin" ]; then
        export PATH="/usr/local/bin:/usr/local/sbin:$PATH"
    fi
elif [[ "$OS" == "Linux" ]]; then
    echo "Detected: Linux ($ARCH)"
else
    echo "Detected: $OS ($ARCH)"
fi

echo ""

# ─── 1. Check & Setup Python Environment ───────────────────────────────────
echo "[1/4] Kiểm tra môi trường Python..."

PYTHON_CMD=""
if [ -f "venv/bin/python" ]; then
    PYTHON_CMD="venv/bin/python"
    echo "  ✓ Tìm thấy môi trường ảo: venv/"
elif [ -f ".venv/bin/python" ]; then
    PYTHON_CMD=".venv/bin/python"
    echo "  ✓ Tìm thấy môi trường ảo: .venv/"
else
    # Find system python
    if command -v python3 &>/dev/null; then
        SYSTEM_PY="python3"
    elif command -v python &>/dev/null; then
        SYSTEM_PY="python"
    else
        echo "  [LỖI] Không tìm thấy Python! Vui lòng cài đặt Python 3.10+:"
        if [[ "$OS" == "Darwin" ]]; then
            echo "    brew install python@3.12"
        else
            echo "    sudo apt install python3 python3-venv python3-pip"
        fi
        exit 1
    fi

    echo "  Khởi tạo môi trường ảo venv..."
    $SYSTEM_PY -m venv venv
    PYTHON_CMD="venv/bin/python"
    echo "  Cài đặt các gói phụ thuộc backend từ requirements.txt..."
    "$PYTHON_CMD" -m pip install --upgrade pip -q
    "$PYTHON_CMD" -m pip install -r requirements.txt -q
    echo "  ✓ Đã thiết lập xong venv/"
fi

# ─── 2. Check Node.js and npm ──────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
    echo "  [LỖI] Không tìm thấy Node.js / npm! Vui lòng cài đặt Node.js:"
    if [[ "$OS" == "Darwin" ]]; then
        echo "    brew install node"
    else
        echo "    sudo apt install nodejs npm"
    fi
    exit 1
fi

# ─── 3. Check & Build Dashboard ───────────────────────────────────────────
echo "[2/4] Kiểm tra Dashboard UI..."
if [ ! -f "dashboard/dist/index.html" ]; then
    echo "  Dashboard dist chưa tồn tại, đang build giao diện..."
    cd dashboard
    if [ ! -d "node_modules" ]; then
        echo "  Cài đặt thư viện dashboard..."
        npm install
    fi
    npm run build
    cd "$SCRIPT_DIR"
    echo "  ✓ Dashboard build hoàn tất!"
else
    echo "  ✓ Dashboard dist đã sẵn sàng!"
fi

# ─── 4. Check Desktop Electron Runtime ────────────────────────────────────
echo "[3/4] Kiểm tra Electron Desktop..."
if [ ! -d "desktop/node_modules" ]; then
    echo "  Cài đặt thư viện Electron..."
    cd desktop
    npm install
    cd "$SCRIPT_DIR"
    echo "  ✓ Electron runtime đã sẵn sàng!"
else
    echo "  ✓ Electron runtime đã sẵn sàng!"
fi

# ─── 5. Launch Electron Desktop App ────────────────────────────────────────
echo "[4/4] Khởi chạy Flow Kit Desktop..."
cd desktop
npm start
