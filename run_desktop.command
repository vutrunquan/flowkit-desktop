#!/usr/bin/env bash
# ==============================================================================
# Double-clickable macOS Launcher for Flow Kit Desktop
# Works on both Apple Silicon (M1/M2/M3/M4) and Intel Macs
# ==============================================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
exec bash "$DIR/run_desktop.sh"
