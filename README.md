# StemSplitterM4L

Split audio into stems (vocals, drums, bass, other) inside Ableton Live using **Demucs** — 100% local, free, no cloud.

Works with Live 10/11. (Live 12 already has native stem separation; use this for older versions.)

## Requirements

- Ableton Live 10 or 11 (with Max for Live)
- Max 8 (Node for Max included)
- Python 3.10 – 3.13
- FFmpeg (Demucs needs it to load audio)

## Installation

### Windows

```powershell
# Recommended: double-click install-windows.bat

# Or run from PowerShell:
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Do not double-click `install.ps1` directly: Windows may open it in VS Code or Notepad instead of running it. Use `install-windows.bat` for double-click installation.

### macOS

```bash
# Double-click install.command, or run:
chmod +x install.command
./install.command
```

The installer:
1. Creates a Python virtual environment (`.venv`)
2. Installs Demucs + dependencies
3. Checks for FFmpeg (you'll get instructions if missing)

## Manual setup

If the installer doesn't work for you:

```bash
# Create venv
python -m venv .venv

# Windows
.\.venv\Scripts\Activate.ps1

# macOS
source .venv/bin/activate

# Install
pip install -U pip
pip install -r python/requirements-lock.txt
```

**FFmpeg**: Demucs needs it to decode audio.

- **Windows**: `winget install Gyan.FFmpeg.Shared` or download from ffmpeg.org and add to PATH.
- **macOS**: `brew install ffmpeg`

## How to use

1. Drop `StemSplitter.amxd` onto an audio track in Ableton Live.
2. The device auto-detects the Python environment.
3. Record audio or drag a file onto the device.
4. Click **SPLIT** — stems appear in the `stems/` folder.

### First-time setup (if needed)

The device uses relative paths by default. If the auto-detection fails, configure manually:

```
loadbang
  └─ set_python .venv/Scripts/python.exe
  └─ set_script python/stem_split.py
  └─ set_out stems
  └─ set_device auto
```

## Project structure

```
StemSplitterM4L/
├── StemSplitter.amxd        # Max for Live device
├── node/stem-runner.js      # Node bridge (inside .amxd)
├── python/
│   ├── stem_split.py        # Demucs wrapper
│   └── requirements-lock.txt
├── install-windows.bat      # Windows double-click installer
├── install.ps1              # Windows installer
├── install.command          # macOS installer
├── renders/                 # Recorded audio
├── stems/                   # Separated output
└── logs/                    # Debug logs
```

## Device messages

| Message | Description |
|---------|-------------|
| `set_input <path>` | Set input audio file |
| `set_preset full4\|vocals2\|drums2\|bass2\|other2\|full6` | Separation preset |
| `set_device auto\|cpu\|cuda` | Processing device |
| `run` | Start separation |
| `split_file <path>` | Drop file and split directly |
| `open_result` | Open output folder |
| `cancel` | Cancel running process |

## Output

Demucs generates stems in `stems/<model>/<filename>/`:
- `vocals.wav`
- `drums.wav`
- `bass.wav`
- `other.wav`

(6-stem mode adds `piano.wav` and `guitar.wav`)

## License

MIT
