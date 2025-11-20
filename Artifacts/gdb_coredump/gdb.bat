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

REM Default paths
set "DEFAULT_BUILD=%SCRIPT_DIR%build.elf"
set "DEFAULT_CORE=%SCRIPT_DIR%coredump.elf"

REM Resolve arguments or defaults
set "BUILD_ELF=%~1"
if "%BUILD_ELF%"=="" set "BUILD_ELF=%DEFAULT_BUILD%"

set "CORE_ELF=%~2"
if "%CORE_ELF%"=="" set "CORE_ELF=%DEFAULT_CORE%"

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