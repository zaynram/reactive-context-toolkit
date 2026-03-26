@echo off
setlocal enabledelayedexpansion

REM Install the tasktools binary into a pixi environment.
REM
REM Method A (submodule): if dev/tasktools/Cargo.toml exists, build from source.
REM   Re-installs automatically when Cargo.toml is newer than the installed binary,
REM   so local edits to the submodule are picked up without manual intervention.
REM
REM Method B (git URL): if no submodule is present, fetch and build from GitHub.
REM   Idempotent — skips the network round-trip if the binary already exists.
REM
REM cargo is provided by the pixi-managed rust package in the DAISY environment.

setlocal
call :configure_env
if errorlevel 1 exit /b 1
call :install_tt
if errorlevel 1 exit /b 1
endlocal
exit /b 0

:configure_env
REM Check required environment variables.
REM Exit with status 1 if CONDA_PREFIX or PIXI_PROJECT_ROOT are not set.
if "!CONDA_PREFIX!"=="" (
    echo [tasktools] error: CONDA_PREFIX is not set. Please activate the appropriate pixi/conda environment before running this script.
    exit /b 1
)
if "!PIXI_PROJECT_ROOT!"=="" (
    echo [tasktools] error: PIXI_PROJECT_ROOT is not set. Please ensure the pixi project is activated before running this script.
    exit /b 1
)

REM Detect the operating system and configure accordingly.
set os=windows
for /f "tokens=2" %%i in ('rustc -vV ^| findstr /r "host:"') do set tc=%%i
if "!tc!"=="" set tc=x86_64-pc-windows-msvc
git config core.longpaths true
set CARGO_BUILD_TARGET=!tc!

echo [tasktools] Target: !CARGO_BUILD_TARGET! (!os!)
exit /b 0

:install_tt
REM Install tasktools binary using either the local submodule (Method A) or GitHub (Method B).
set target=!CONDA_PREFIX!\bin\tasktools.exe
set submod=!PIXI_PROJECT_ROOT!\dev\tasktools\Cargo.toml

if exist "!submod!" (
    set dir=!PIXI_PROJECT_ROOT!\dev\tasktools
    REM Method A: local submodule — rebuild if binary is missing or any source is newer.
    if not exist "!target!" (
        echo [tasktools] building from submodule ^(dev/tasktools^)...
        cargo install --quiet --root "!CONDA_PREFIX!" --path "!dir!"
        if errorlevel 1 exit /b 1
    ) else (
        REM Check if any source files are newer than the binary
        for /r "!dir!" %%f in (Cargo.*, *.rs, *.toml) do (
            if %%f gtr "!target!" (
                echo [tasktools] building from submodule ^(dev/tasktools^)...
                cargo install --quiet --root "!CONDA_PREFIX!" --path "!dir!"
                if errorlevel 1 exit /b 1
                exit /b 0
            )
        )
    )
) else (
    set url=https://github.com/zaynram/tasktools
    REM Method B: no submodule — install from GitHub if binary is missing.
    if not exist "!target!" (
        echo [tasktools] installing from !url!...
        cargo install --quiet --root "!CONDA_PREFIX!" --git "!url!"
        if errorlevel 1 exit /b 1
    )
)
exit /b 0
