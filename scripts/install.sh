#!/usr/bin/env bash -o pipefail
set -euo pipefail

# Install the tasktools binary into a pixi environment.
#
# Method A (submodule): if dev/tasktools/Cargo.toml exists, build from source.
#   Re-installs automatically when Cargo.toml is newer than the installed binary,
#   so local edits to the submodule are picked up without manual intervention.
#
# Method B (git URL): if no submodule is present, fetch and build from GitHub.
#   Idempotent — skips the network round-trip if the binary already exists.
#
# cargo is provided by the pixi-managed rust package in the DAISY environment.

function normalize {
    # Normalize a file path to an absolute path using realpath if available,
    # otherwise use cd and pwd to resolve the path.
    local orig="$1"
    if command -v realpath >/dev/null 2>&1
    then
        realpath "$orig" 2>/dev/null ||
        printf '%s' "$orig"
    else
        cd -P -- "$(dirname -- "$orig")" >/dev/null &&
        printf '%s/%s' "$(pwd -P)" "$(basename -- "$orig")" ||
        printf '%s' "$orig"
    fi
}

function configure_env {
    # Check required environment variables.
    # Exits with status 1 if CONDA_PREFIX or PIXI_PROJECT_ROOT are not set.
    if   [ -z "${CONDA_PREFIX:-}" ]
    then
        echo "[tasktools] error: CONDA_PREFIX is not set. Please activate the appropriate pixi/conda environment before running this script." >&2
        return 1
    fi
    if [ -z "${PIXI_PROJECT_ROOT:-}" ]
    then
        echo "[tasktools] error: PIXI_PROJECT_ROOT is not set. Please ensure the pixi project is activated before running this script." >&2
        return 1
    fi
    # Detect the operating system and configure accordingly.
    # Sets git config core.longpaths and CARGO_BUILD_TARGET appropriately if on windows.
    case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        local tc=$(rustc -vV 2>&1 | awk '/host:/ {print $2; exit}')
        git config core.longpaths true || true
        export CARGO_BUILD_TARGET="${tc:-'x86_64-pc-windows-msvc'}"
        local os="windows"
    ;;
    *"Microsoft"*)
        local os="wsl"
    ;;
    Linux)
        local os="linux"
    ;;
    Darwin)
        local os="macos"
    ;;
    esac
    # Report build target and OS if matched
    # Return ok status for continuation
    echo "[tasktools] Target: ${CARGO_BUILD_TARGET} (${os:-'unknown'})"
    return 0
}

function install_tt {
    configure_env || return 1
    # Install tasktools binary using either the local submodule (Method A) or GitHub (Method B).
    local target=$(normalize "${CONDA_PREFIX}/bin/tasktools")
    local submod=$(normalize "${PIXI_PROJECT_ROOT}/dev/tasktools/Cargo.toml")
    if [ -f "${submod}" ]
    then
        local dir=$(normalize "${PIXI_PROJECT_ROOT}/dev/tasktools")
        # Method A: local submodule — rebuild if binary is missing or any source is newer.
        if [ ! -f "${target}" ] ||
        find "${dir}" \( -name 'Cargo.*' -o -name '*.rs' -o -name '*.toml' \) -newer "${target}" 2>/dev/null | read
        then
            echo "[tasktools] building from submodule (dev/tasktools)..."
            cargo install --quiet --root "${CONDA_PREFIX}" --path "${dir}"
        fi
    else
        local url="https://github.com/zaynram/tasktools"
        # Method B: no submodule — install from GitHub if binary is missing.
        if [ ! -f "${target}" ]
        then
            echo "[tasktools] installing from ${url}..."
            cargo install --quiet --root "${CONDA_PREFIX}" --git "${url}"
        fi
    fi
    return 0
}

install_tt
