@echo off
title SOC Monitor - Launcher
echo Starting all SOC Monitor services...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1"
