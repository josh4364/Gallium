## USER

Using this project overview
@specs/project.md
And the features located within `specs`

Create **only** a task document in `specs/tasks` called `task-bootstrap.md`
Have it document the steps and actions to be taken to perform the following requirements:
```
* Overall goal: bootstrap the project so it is ready to be developted.
* Setup source directories.
* Gather third party dependices.
* Create placeholder applications / documents / hello world's
* Setup project build systems.
```


## GEMINI3

I have created the task document 
specs/tasks/task-bootstrap.md
 as requested. This document provides a comprehensive roadmap for bootstrapping the Gallium project, ensuring it is ready for development.

Summary of the Bootstrap Task:
Source Directories: Defines a clean structure including source/server, source/client, and source/common.
Dependencies: Specifies the Nix environment configuration using a flake.nix to pull in notcurses, sqlite3, libwebsockets, and json-c.
Build System: Outlines the CMake hierarchy for building both the server and TUI client, along with a shared common library.
Placeholders: Includes "Hello World" implementations for the server (database and networking init) and the client (notcurses rendering).
Configuration: Sets up templates for tasks.json and keys.json, as well as version control ignores.
You can find the detailed steps and verification instructions in the new file: specs/tasks/task-bootstrap.md



## USER follow up in a new thread



