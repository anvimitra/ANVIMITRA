@echo off
title ANVI Easy Crop - Desktop Studio
echo Starting ANVI Easy Crop Studio (Offline Desktop Mode)...

:: Check for Microsoft Edge or Chrome for true App Mode
set EDGE_EXE="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE_EXE% (
    set EDGE_EXE="%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

set CHROME_EXE="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_EXE% (
    set CHROME_EXE="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)

set TARGET_FILE="%~dp0dist\easy-crop.html"
if not exist %TARGET_FILE% (
    set TARGET_FILE="%~dp0easy-crop.html"
)

if exist %EDGE_EXE% (
    start "" %EDGE_EXE% --app="file:///%TARGET_FILE:\=/%" --window-size=1280,840
    exit /b
)

if exist %CHROME_EXE% (
    start "" %CHROME_EXE% --app="file:///%TARGET_FILE:\=/%" --window-size=1280,840
    exit /b
)

start "" "%TARGET_FILE%"
exit /b
