@echo off
chcp 65001 >nul
title 正经素材库 - 成员账号管理
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\manage-members.ps1"
echo.
pause
