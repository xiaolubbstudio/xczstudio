@echo off
chcp 65001 >nul
title 正经素材库 - 入口紧急控制
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\studio-emergency.ps1"
echo.
pause
