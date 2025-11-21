@echo off
REM =============================================================================
REM Helper script to open a firmware ELF and coredump ELF in arm-none-eabi-gdb
REM Usage:
REM   gdb.bat [path\to\build.elf] [path\to\coredump.elf]
REM If arguments are omitted, defaults are used.
REM =============================================================================

setlocal enabledelayedexpansion

REM Allow overriding the GDB executable (falls back to arm-none-eabi-gdb)
set "GDB_CMD=%GDB_EXE%"
if "%GDB_CMD%"=="" set "GDB_CMD=arm-none-eabi-gdb"

REM Optional extra -ex commands (space-delimited) supplied through GDB_EXTRA_EX
set "GDB_EXTRA_EX=%GDB_EXTRA_EX%"

set "SCRIPT_DIR=%~dp0"

REM Resolve arguments or auto-detect from directory
set "BUILD_ELF=%~1"
set "CORE_ELF=%~2"

REM If no arguments provided, auto-detect files
if "%BUILD_ELF%"=="" (
    REM Find STM32WB55_BLE_Garage_Intrusion_Sensor_Debug*.elf for build
    for %%f in ("%SCRIPT_DIR%STM32WB55_BLE_Garage_Intrusion_Sensor_Debug*.elf") do set "BUILD_ELF=%%f"
)

if "%CORE_ELF%"=="" (
    REM Find coredump_multithread*.elf for coredump
    for %%f in ("%SCRIPT_DIR%coredump_multithread*.elf") do set "CORE_ELF=%%f"
)

if not exist "%BUILD_ELF%" (
    echo [ERROR] Build ELF not found: %BUILD_ELF%
    exit /b 1
)

if not exist "%CORE_ELF%" (
    echo [ERROR] Coredump ELF not found: %CORE_ELF%
    exit /b 1
)

echo Launching %GDB_CMD% with:
echo   Symbols : %BUILD_ELF%
echo   Coredump: %CORE_ELF%

"%GDB_CMD%" -ex "set confirm off" -ex "set pagination off" -se "%BUILD_ELF%" -core "%CORE_ELF%" !GDB_EXTRA_EX!

endlocalset logging off