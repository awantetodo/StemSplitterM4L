#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "=== StemSplitterM4L Installer (macOS) ==="
echo "Target: $PROJECT_DIR"
echo ""

# 1. Check Python
PY=""
if command -v python3 &>/dev/null; then
    PY=python3
elif command -v python &>/dev/null; then
    PY=python
else
    echo "ERROR: Python not found. Install Python 3.10+ from python.org"
    exit 1
fi
echo "[OK] Python: $(which $PY)"
echo "Version: $($PY --version 2>&1)"

# 2. Create venv
VENV="$PROJECT_DIR/.venv"
if [ -d "$VENV" ]; then
    echo "[SKIP] Virtual env already exists at $VENV"
else
    echo "Creating virtual environment..."
    $PY -m venv "$VENV"
    echo "[OK] Virtual environment created"
fi

PIP="$VENV/bin/pip"
PYTHON="$VENV/bin/python"

# 3. Upgrade pip
echo "Upgrading pip..."
$PYTHON -m pip install -U pip --quiet
echo "[OK] pip upgraded"

# 4. Install dependencies
REQ_LOCK="$PROJECT_DIR/python/requirements-lock.txt"
REQ="$PROJECT_DIR/python/requirements.txt"
if [ -f "$REQ_LOCK" ]; then
    REQ_FILE="$REQ_LOCK"
else
    REQ_FILE="$REQ"
fi

echo "Installing dependencies..."
$PIP install -r "$REQ_FILE"
echo "[OK] Dependencies installed"

# 5. Check FFmpeg
if command -v ffmpeg &>/dev/null; then
    echo "[OK] FFmpeg: $(which ffmpeg)"
else
    echo ""
    echo "WARNING: FFmpeg not found. Demucs needs it to load audio."
    echo "Install with: brew install ffmpeg"
    echo "Or download from: https://ffmpeg.org/download.html"
fi

# 6. Create required folders
mkdir -p "$PROJECT_DIR/renders" "$PROJECT_DIR/stems" "$PROJECT_DIR/logs"

echo ""
echo "=== Installation complete ==="
echo ""
echo "Next steps:"
echo "  1. Open StemSplitter.amxd in Ableton Live"
echo "  2. The device auto-detects Python at: $VENV"
echo "  3. Configure paths in the device if needed"
read -p "Press Enter to close..."
