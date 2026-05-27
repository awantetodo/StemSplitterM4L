param(
    [string]$TargetDir = "."
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path $TargetDir
Write-Host "=== StemSplitterM4L Installer (Windows) ===" -ForegroundColor Cyan
Write-Host "Target: $ProjectRoot"
Write-Host ""

# 1. Check Python
$py = (Get-Command "python" -ErrorAction SilentlyContinue).Source
if (-not $py) {
    $py = (Get-Command "python3" -ErrorAction SilentlyContinue).Source
}
if (-not $py) {
    Write-Host "ERROR: Python not found. Install Python 3.10+ from python.org" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Python: $py"

# 2. Create venv
$venv = Join-Path $ProjectRoot ".venv"
if (Test-Path $venv) {
    Write-Host "[SKIP] Virtual env already exists at $venv"
} else {
    Write-Host "Creating virtual environment..."
    & $py -m venv $venv
    if (-not $?) { exit 1 }
    Write-Host "[OK] Virtual environment created"
}

$pip = Join-Path $venv "Scripts" "pip.exe"
$python = Join-Path $venv "Scripts" "python.exe"

# 3. Upgrade pip
Write-Host "Upgrading pip..."
& $python -m pip install -U pip --quiet
Write-Host "[OK] pip upgraded"

# 4. Install dependencies
$reqLock = Join-Path $ProjectRoot "python" "requirements-lock.txt"
$req = Join-Path $ProjectRoot "python" "requirements.txt"
$reqFile = $reqLock
if (-not (Test-Path $reqLock)) { $reqFile = $req }

Write-Host "Installing dependencies..."
& $pip install -r $reqFile
if (-not $?) { exit 1 }
Write-Host "[OK] Dependencies installed"

# 5. Check FFmpeg
$ffmpeg = (Get-Command "ffmpeg" -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) {
    Write-Host ""
    Write-Host "WARNING: FFmpeg not found. Demucs needs it to load audio." -ForegroundColor Yellow
    Write-Host "Install it with: winget install Gyan.FFmpeg.Shared" -ForegroundColor Yellow
    Write-Host "Or download from: https://ffmpeg.org/download.html" -ForegroundColor Yellow
    Write-Host "Make sure ffmpeg.exe is in your PATH, then restart this script." -ForegroundColor Yellow
} else {
    Write-Host "[OK] FFmpeg: $ffmpeg"
}

# 6. Create required folders
@("renders", "stems", "logs") | ForEach-Object {
    $dir = Join-Path $ProjectRoot $_
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

Write-Host ""
Write-Host "=== Installation complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open StemSplitter.amxd in Ableton Live"
Write-Host "  2. The device auto-detects Python at: $venv"
Write-Host "  3. Configure paths in the device if needed"
pause
