@echo off
title rave_dj URL Resolver
cd /d "%~dp0"
echo.
echo  rave_dj URL Resolver
echo  Listening on http://127.0.0.1:4000
echo  Keep this window open while the server is running.
echo.
node server.js
pause
