@echo off
rem Starts the portal on this laptop and opens it to the internet through ngrok.
rem Keep this window open while people use the site. Close it to take the site offline.
set NGROK_DOMAIN=YOUR-NGROK-DOMAIN.ngrok-free.app

cd /d "%~dp0"
net start MongoDB >nul 2>&1
start "VIT portal server" python serve.py
timeout /t 3 >nul
ngrok http --url=%NGROK_DOMAIN% 5500
