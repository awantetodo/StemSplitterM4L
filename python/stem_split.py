#!/usr/bin/env python3
"""Run Demucs stem separation for an input WAV file."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def _print(stream, level: str, message: str) -> None:
    stream.write(f"[{level}] {message}\n")
    stream.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split audio into stems using Demucs")
    parser.add_argument("--input", required=True, help="Input audio file path")
    parser.add_argument("--out", required=True, help="Output directory root")
    parser.add_argument("--mode", choices=("2", "4"), default="4", help="2 or 4 stems")
    parser.add_argument("--model", default="htdemucs", help="Demucs model name")
    parser.add_argument(
        "--two-stem-target",
        default="vocals",
        help="Target for two-stem mode (default: vocals)",
    )
    parser.add_argument(
        "--device",
        default="",
        help="Optional device override for Demucs (cuda or cpu; auto leaves default)",
    )
    return parser.parse_args()


def resolve_result_dir(output_root: Path, model: str, input_wav: Path) -> Path:
    model_dir = output_root / model
    preferred = model_dir / input_wav.stem
    if preferred.exists():
        return preferred

    if model_dir.exists():
        candidates = [p for p in model_dir.iterdir() if p.is_dir()]
        if candidates:
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return candidates[0]

    return preferred


def main() -> int:
    args = parse_args()
    input_wav = Path(args.input).expanduser().resolve()
    output_root = Path(args.out).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    if not input_wav.exists():
        _print(sys.stderr, "ERR", f"Input file does not exist: {input_wav}")
        return 1

    cmd = [
        sys.executable,
        "-m",
        "demucs.separate",
        "-n",
        args.model,
        "-o",
        str(output_root),
    ]

    if args.mode == "2":
        cmd.append(f"--two-stems={args.two_stem_target}")

    normalized_device = args.device.strip().lower()
    if normalized_device and normalized_device != "auto":
        cmd.extend(["--device", normalized_device])

    cmd.append(str(input_wav))

    _print(sys.stdout, "INFO", f"Input: {input_wav}")
    _print(sys.stdout, "INFO", f"Output root: {output_root}")
    _print(sys.stdout, "INFO", f"Command: {' '.join(cmd)}")

    env = os.environ.copy()

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        env=env,
    )

    assert process.stdout is not None
    for line in process.stdout:
        sys.stdout.write(line)

    process.wait()
    if process.returncode != 0:
        _print(sys.stderr, "ERR", f"Demucs failed with exit code {process.returncode}")
        return process.returncode

    result_dir = resolve_result_dir(output_root, args.model, input_wav)
    _print(sys.stdout, "OK", "Stem separation finished")
    _print(sys.stdout, "RESULT", str(result_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
