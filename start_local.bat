@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set PYTHONUNBUFFERED=1
title Mavis AI - Chay Noi Bo (Khong can Internet / Cloudflare)
cd /d "%~dp0"

echo ========================================================
echo   KHOI CHAY SERVER NOI BO (LOCAL HTTP)
echo ========================================================
echo Dang khoi dong may chu va mo ca 2 web tren trinh duyet...
echo.

python -u server.py

echo.
pause
