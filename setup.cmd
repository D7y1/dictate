@echo off
rem Double-click to set up Dictate on Windows (same as "npm run setup").
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Dictate needs Node.js 20 or newer, and it isn't installed.
  echo Install it from https://nodejs.org ^(LTS^) or run:  winget install OpenJS.NodeJS.LTS
  echo Then run setup.cmd again.
  goto end
)
node scripts\setup.js %*
:end
rem Keep the window open when started by double-click, so you can read the result.
echo %cmdcmdline% | find /i "%~0" >nul
if not errorlevel 1 (
  echo.
  pause
)
