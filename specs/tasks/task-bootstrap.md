# Task: Project Bootstrap

## 1. Goal
Bootstrap the Gallium project for development, including source directory structure, build system, third-party dependencies via Nix, and basic placeholder applications for the server and TUI client.

## 2. Requirements

### 2.1 Setup Source Directories
- **Action**: Create the following directory structure at the project root:
    - `source/`: Main source code directory.
        - `source/server/`: Gallium server implementation.
        - `source/client/`: Gallium TUI client (notcurses) implementation.
        - `source/common/`: Shared code, protocol definitions, and serialization.
    - `third_party/`: External dependencies or project-specific C++ wrappers (Opaque Pointers).
    - `assets/`: Static assets, icons, and default configuration templates.
    - `db/`: Default location for local SQLite databases (managed by server).

### 2.2 Gather Third Party Dependencies (Nix Setup)
- **Action**: Create a `flake.nix` to define the development shell and dependencies.
- **Required Packages**:
    - `cmake`, `pkg-config`, `gcc` (or `clang`).
    - `notcurses` (TUI library).
    - `sqlite` (Database).
    - `libwebsockets` (Networking).
    - `json-c` (JSON serialization).

### 2.3 Setup Project Build Systems (CMake)
- **Action**: Initialize CMake hierarchy.
    - **Root `CMakeLists.txt`**: Define project `Gallium`, set C99/C11 standards, find packages (pkg-config), and add subdirectories.
    - **`source/common/CMakeLists.txt`**: Create a static library `gallium_common`.
    - **`source/server/CMakeLists.txt`**: Create executable `gallium-server`. Link with `sqlite3`, `libwebsockets`, `json-c`, and `gallium_common`.
    - **`source/client/CMakeLists.txt`**: Create executable `gallium-tui`. Link with `notcurses`, `libwebsockets`, `json-c`, and `gallium_common`.

### 2.4 Create Placeholder Applications
- **Server Placeholder (`source/server/main.c`)**: 
    - Print "Gallium Server Initializing...".
    - Attempt to open/create `gallium.db` using SQLite3.
    - Minimal libwebsockets context initialization loop.
- **Client Placeholder (`source/client/main.c`)**:
    - Initialize `notcurses`.
    - Render a simple centered string "Gallium TUI v0.1".
    - Wait for a keypress and exit cleanly.
- **Common Header (`source/common/protocol.h`)**:
    - Define `gallium_msg_header` struct (MessageID, Length).
    - Enum for `GALLIUM_MSG_ID` (INIT, TASK_UPDATE, etc.).

### 2.5 Project Documents & Configs
- **Action**: Create initial config files in the workspace root.
    - `tasks.json`: Basic template with `build` and `test` commands.
    - `keys.json`: Empty template for API keys (ensure added to `.gitignore`).
    - `.gitignore`: Exclude `build/`, `*.db`, and `keys.json`.

## 3. Verification Steps
1. **Environment**: Run `nix develop` to verify all toolchains are available.
2. **Build**: 
   ```bash
   mkdir build && cd build
   cmake ..
   make
   ```
3. **Execution**:
   - Run `./source/server/gallium-server` to confirm server and DB init.
   - Run `./source/client/gallium-tui` to confirm notcurses rendering.
