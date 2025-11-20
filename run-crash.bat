@echo off
setlocal EnableDelayedExpansion
set "DEFAULT_CRASH_NAME=STM32WB55_Intrusion_Sensor"

if /I "%~1"=="/h" goto :showHelp
if /I "%~1"=="-h" goto :showHelp
if /I "%~1"=="--help" goto :showHelp
if /I "%~1"=="/?" goto :showHelp

if "%~1"=="" goto promptForName
set "USER_CRASH_NAME=%~1"
shift
:collectArgs
if "%~1"=="" goto afterArgs
set "USER_CRASH_NAME=!USER_CRASH_NAME! %~1"
shift
goto collectArgs

:promptForName
echo Enter crash name (leave blank for %DEFAULT_CRASH_NAME%):
set /p USER_CRASH_NAME=>

:afterArgs
if defined USER_CRASH_NAME (
  set "USER_CRASH_NAME=!USER_CRASH_NAME:"=!"
)

if defined USER_CRASH_NAME (
  set "CRASH_NAME=!USER_CRASH_NAME!"
  echo Using crash name "!CRASH_NAME!".
) else (
  set "CRASH_NAME="
  echo Using default crash name "%DEFAULT_CRASH_NAME%".
)

echo Running npm run crash ...
npm run crash
goto :eof

:showHelp
echo.
echo Usage: run-crash.bat [crash name]
echo.
echo Examples:
echo   run-crash.bat
echo   run-crash.bat Garage_Door_Watchdog
echo   run-crash.bat "Garage Door Watchdog"
echo.
echo The script sets CRASH_NAME before calling "npm run crash".
echo Leave the name blank to use the default of %DEFAULT_CRASH_NAME%.
goto :eof
