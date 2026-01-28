# Common Workspace and File Tools

Below is a comprehensive list of the common workspace and file tools available to the system, along with their descriptions.

## File System Navigation & Search

### `list_dir`
**Description:** List the contents of a directory, i.e., all files and subdirectories that are children of the directory. The directory path must be an absolute path. The output includes the relative path, type (file/directory), size (if file), and potentially the number of children (if directory).

### `find_by_name`
**Description:** Search for files and subdirectories within a specified directory using `fd`. Search uses smart case and ignores gitignored files by default. Supports glob patterns and extension filtering. Results include type, size, modification time, and relative path.

### `grep_search`
**Description:** Use `ripgrep` to find exact pattern matches within files or directories. Results are returned in JSON format including filename, line number, and line content. Supports case-insensitivity, regex, and file include/exclude patterns.

## File Reading & Analysis

### `view_file`
**Description:** View the contents of a file from the local filesystem. Supports text and some binary files. For text files, it allows viewing specific line ranges (1-indexed). Enforces a limit (e.g., 800 lines) per view to manage context.

### `view_file_outline`
**Description:** View the outline of a file to understand its structure (classes, functions). Shows node paths, signatures, and line ranges. This is a preferred first step for exploring large files.

### `view_code_item`
**Description:** View the content of specific code nodes (classes or functions) in a file using fully qualified names. Useful for inspecting specific definitions found via search or outline tools.

### `view_content_chunk`
**Description:** View a specific chunk of document content using its DocumentId and chunk position. This is typically used after `read_url_content` to navigate large documents.

## File Editing

### `write_to_file`
**Description:** Create new files or overwrite existing ones. Can create parent directories if they don't exist. Requires explicit confirmation to overwrite existing files.

### `replace_file_content`
**Description:** Edit an existing file by replacing a **single contiguous** block of text. Requires exact matching of the target content to ensure safety. Best for changing one function or block.

### `multi_replace_file_content`
**Description:** Edit an existing file by making **multiple, non-contiguous** edits in a single pass. Useful for renaming variables across a file or making several independent changes.

## Command Execution & Terminal

### `run_command`
**Description:** Propose a shell command (Linux/Bash) to run on the user's system. Supports running in the background and requires user approval for potentially unsafe commands.

### `command_status`
**Description:** Get the status of a previously executed background command by its ID. Returns current status, output lines, and any errors.

### `send_command_input`
**Description:** Send standard input to a running command or terminate it. Critical for interacting with REPLs, long-running processes, or interactive scripts.

### `read_terminal`
**Description:** Read the contents of a specific terminal's output given its process ID.

## Web & Browser

### `browser_subagent`
**Description:** Start a specialized subagent to perform actions in a browser environment. Can interact with page content (click, type) and control the window. Records interactions as videos.

### `read_url_content`
**Description:** Fetch content from a URL via HTTP request. invisible to the user. Converts HTML to markdown. Best for reading documentation or static content quickly.

### `search_web`
**Description:** Perform a web search (e.g., Google) for a query and return a summary of relevant information and citations.

## Creative

### `generate_image`
**Description:** Generate or edit images based on a text prompt. Can create UI mockups or assets.
