@echo off
rem Starts the portal on this laptop and opens it to the internet through ngrok.
rem Keep this window open while people use the site. Close it to take the site offline.
set NGROK_DOMAIN=conceded-salami-pushover.ngrok-free.dev

cd /d "%~dp0"
where ngrok >nul 2>&1 || set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe"
rem Use the cloud database (Atlas) when keys.env has a link; otherwise the local MongoDB.
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /r "CLOUD_DB_URI ATLAS_URI" keys.env`) do set "MONGODB_URI=%%b"
if not defined MONGODB_URI net start MongoDB >nul 2>&1
start "VIT portal server" python serve.py
timeout /t 3 >nul
ngrok http --url=%NGROK_DOMAIN% 5500
