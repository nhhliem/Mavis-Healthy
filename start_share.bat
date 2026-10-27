@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set PYTHONUNBUFFERED=1
title Mavis AI - Khoi Chay Web Chinh va Web Quan Tri Mavis Admin
cd /d "%~dp0"

echo ========================================================
echo   KHOI CHAY WEB CHINH VA WEB QUAN TRI MAVIS ADMIN
echo ========================================================
echo Dang khoi dong may chu va tu dong mo ca 2 web tren trinh duyet...
echo.

taskkill /f /im cloudflared.exe >nul 2>&1
python -u share.py

echo.
echo ========================================================
echo   Cua so nay da dung. Nhan phim bat ky de thoat.
echo ========================================================
pause
