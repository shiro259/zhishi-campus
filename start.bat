@echo off
chcp 65001 >nul
title 食遇校园 - 后端服务
cd /d "c:\Users\lenovo\Desktop\mp-01\食遇——AI智能食堂\backend"
echo ========================================
echo   食遇校园 - 后端服务启动中...
echo ========================================
echo.
echo  API 地址: http://localhost:8000
echo  API 文档: http://localhost:8000/docs
echo.
echo  按 Ctrl+C 停止服务
echo.
python run.py
pause
