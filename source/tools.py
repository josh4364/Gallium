import os
import glob
import json
import subprocess
import time
from pathlib import Path
from typing import List, Dict, Union, Optional

def _validate_path(path: str) -> str:
    """
    Validate that the path is absolute and within the current working directory (sandbox).
    Returns the absolute, resolved path.
    """
    if not os.path.isabs(path):
        # If relative, resolve against CWD
        abs_path = os.path.abspath(path)
    else:
        abs_path = os.path.abspath(path)
        
    workspace_root = os.getcwd()
    
    # Check if path is within workspace_root
    # We use commonpath to check if workspace_root is a prefix
    try:
        common = os.path.commonpath([abs_path, workspace_root])
        # If common path IS the workspace root, it's valid.
        # But wait, commonpath returns the longest common sub-path.
        # If abs_path is /foo/bar and root is /foo, common is /foo. Correct.
        # If abs_path is /baz/bar and root is /foo, common is /. Incorrect.
        
        if os.path.commonpath([abs_path, workspace_root]) != workspace_root:
             raise PermissionError(f"Access denied: Path {path} is outside the workspace root {workspace_root}")
    except ValueError:
        # Can happen on Windows if drives are different
        raise PermissionError(f"Access denied: Path {path} is on a different drive than {workspace_root}")
        
    return abs_path

def list_dir(directory_path: str) -> List[Dict[str, Union[str, int]]]:
    """
    List the contents of a directory.
    """
    safe_path = _validate_path(directory_path)
    
    if not os.path.isdir(safe_path):
        raise FileNotFoundError(f"Directory not found: {directory_path}")
        
    results = []
    try:
        with os.scandir(safe_path) as entries:
            for entry in entries:
                item = {
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "path": entry.path,
                }
                
                if entry.is_file():
                    item["size"] = entry.stat().st_size
                elif entry.is_dir():
                    try:
                        item["children_count"] = len(os.listdir(entry.path))
                    except PermissionError:
                         item["children_count"] = -1
                
                results.append(item)
    except PermissionError:
        raise PermissionError(f"Permission denied accessing directory: {directory_path}")
        
    return results

def find_by_name(search_directory: str, pattern: Optional[str] = None, 
                 excludes: Optional[List[str]] = None, extensions: Optional[List[str]] = None,
                 full_path: bool = False, max_depth: Optional[int] = None, 
                 type_filter: str = "any") -> List[Dict]:
    """
    Search for files and subdirectories using fd.
    """
    safe_path = _validate_path(search_directory)

    cmd = ["fd"]
    
    if excludes:
        for excl in excludes:
            cmd.extend(["--exclude", excl])
            
    if extensions:
        for ext in extensions:
            cmd.extend(["--extension", ext])
            
    if full_path:
        cmd.append("--full-path")
        
    if max_depth is not None:
        cmd.extend(["--max-depth", str(max_depth)])
        
    if type_filter == "file":
        cmd.extend(["--type", "f"])
    elif type_filter == "directory":
        cmd.extend(["--type", "d"])
        
    if pattern:
        cmd.append(pattern)
    else:
        cmd.append(".")


    cmd.append(safe_path)
    
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        results = []
        count = 0
        
        while True:
            line = process.stdout.readline()
            if not line:
                break
            path_str = line.strip()
            if not path_str:
                continue
                
            count += 1
            if count > 50:
                break
                
            try:
                p = Path(path_str)
                # Need to check existence/stat, fd output is reliable but race conditions exist
                if not p.exists():
                     continue
                     
                stat = p.stat()
                try:
                    rel_path = str(p.relative_to(safe_path))
                except ValueError:
                    rel_path = str(p) # Fallback if not relative

                item = {
                    "relative_path": rel_path,
                    "type": "directory" if p.is_dir() else "file",
                    "size": stat.st_size,
                    "modification_time": stat.st_mtime,
                    "path": str(p)
                }
                results.append(item)
            except (OSError, ValueError):
                continue
                
        process.terminate()
        return results
        
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"fd failed: {e.stderr}")

def grep_search(search_path: str, query: str, case_insensitive: bool = False,
                includes: Optional[List[str]] = None, is_regex: bool = False,
                match_per_line: bool = False) -> List[Dict]:
    """
    Use ripgrep to find matches.
    """
    safe_path = _validate_path(search_path)
    
    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"Path not found: {search_path}")

    cmd = ["rg"]
    
    if case_insensitive:
        cmd.append("-i")
        
    if not is_regex:
        cmd.append("-F")
        
    if includes:
        if os.path.isdir(safe_path):
            for inc in includes:
                cmd.extend(["-g", inc])

    if not match_per_line:
        cmd.append("-l") # files with matches
    else:
        cmd.append("--json")

    cmd.append(query)
    cmd.append(safe_path)
    
    results = []
    
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        if not match_per_line:
            lines = stdout.strip().splitlines()
            for line in lines[:50]:
                results.append({"Filename": line})
        else:
            count = 0
            for line in stdout.splitlines():
                if count >= 50: break
                try:
                    data = json.loads(line)
                    if data.get("type") == "match":
                        data_data = data.get("data")
                        item = {
                            "Filename": data_data.get("path", {}).get("text"),
                            "LineNumber": data_data.get("line_number"),
                            "LineContent": data_data.get("lines", {}).get("text", "").strip()
                        }
                        results.append(item)
                        count += 1
                except json.JSONDecodeError:
                    continue
                    
        return results
    except Exception as e:
        raise RuntimeError(f"rg failed: {e}")

def view_file(absolute_path: str, start_line: Optional[int] = None, end_line: Optional[int] = None) -> str:
    """
    View the contents of a file.
    """
    safe_path = _validate_path(absolute_path)
    
    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"File not found: {absolute_path}")
        
    if os.path.isdir(safe_path):
        raise IsADirectoryError(f"Path is a directory: {absolute_path}")

    # Check for binary
    is_binary = False
    try:
        with open(safe_path, 'rb') as f:
            chunk = f.read(8000)
            if b'\0' in chunk:
                is_binary = True
    except OSError:
        pass
        
    if is_binary:
        return "[Binary file]"

    try:
        with open(safe_path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
            
        total_lines = len(lines)
        
        start = start_line if start_line is not None else 1
        end = end_line if end_line is not None else total_lines
        
        if start < 1: start = 1
        if end > total_lines: end = total_lines
        
        limit = 800
        if (end - start + 1) > limit:
            end = start + limit - 1
            
        result = [
            f"File Path: {safe_path}",
            f"Total Lines: {total_lines}",
            f"Showing lines {start} to {end}",
            ""
        ]
        
        for i in range(start - 1, end):
            result.append(f"{i+1}: {lines[i].rstrip()}")
            
        return "\n".join(result)
            
    except Exception as e:
        raise RuntimeError(f"Error reading file: {e}")

def read_file(absolute_path: str) -> str:
    """
    Read the raw contents of a file (sandboxed).
    """
    safe_path = _validate_path(absolute_path)
    
    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"File not found: {absolute_path}")
        
    if os.path.isdir(safe_path):
        raise IsADirectoryError(f"Path is a directory: {absolute_path}")

    # Check for binary
    try:
        with open(safe_path, 'rb') as f:
            chunk = f.read(8000)
            if b'\0' in chunk:
                return "[Binary file]"
    except OSError:
        pass
        
    try:
        with open(safe_path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    except Exception as e:
        raise RuntimeError(f"Error reading file: {e}")

def view_file_outline(absolute_path: str, item_offset: int = 0) -> str:
    """
    View the outline of a file.
    """
    safe_path = _validate_path(absolute_path)
        
    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"File not found: {absolute_path}")
        
    if safe_path.endswith('.py'):
        try:
            with open(safe_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            import ast
            tree = ast.parse(content)
            
            items = []
            
            class OutlineVisitor(ast.NodeVisitor):
                def __init__(self):
                    self.stack = []
                    
                def visit_ClassDef(self, node):
                    self.stack.append(node.name)
                    self._add_item(node, "class")
                    self.generic_visit(node)
                    self.stack.pop()
                    
                def visit_FunctionDef(self, node):
                    # Check if method or function
                    path = ".".join(self.stack + [node.name])
                    self._add_item(node, "function", path=path)
                    self.stack.append(node.name)
                    self.generic_visit(node)
                    self.stack.pop()
                    
                def visit_AsyncFunctionDef(self, node):
                    path = ".".join(self.stack + [node.name])
                    self._add_item(node, "async function", path=path)
                    self.stack.append(node.name)
                    self.generic_visit(node)
                    self.stack.pop()

                def _add_item(self, node, type_, path=None):
                    if path is None:
                        path = ".".join(self.stack)
                    
                    args = [a.arg for a in node.args.args]
                    signature = f"{node.name}({', '.join(args)})"
                    
                    items.append({
                        "name": path,
                        "type": type_,
                        "signature": signature,
                        "start_line": node.lineno,
                        "end_line": getattr(node, 'end_lineno', node.lineno)
                    })
            
            visitor = OutlineVisitor()
            visitor.visit(tree)
            
            total_items = len(items)
            page_size = 50
            start_idx = item_offset
            end_idx = min(start_idx + page_size, total_items)
            
            result = [
                f"File Path: {safe_path}",
                f"Total Lines: {len(content.splitlines())}",
                f"Total Outline Items: {total_items}",
                f"Items {start_idx} to {end_idx}", 
                ""
            ]
            
            for item in items[start_idx:end_idx]:
                 result.append(f"{item['start_line']}-{item['end_line']} [{item['type']}] {item['name']} {item['signature']}")
                 
            return "\n".join(result)
            
        except Exception as e:
            return f"Error parsing python file: {e}"
    else:
        return "Outline not supported for this file type (only .py supported in this implementation)."

def view_code_item(file_path: str, node_paths: List[str]) -> str:
    """
    View code items.
    """
    safe_path = _validate_path(file_path)
    
    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    if not safe_path.endswith('.py'):
        return "Only .py supported"
        
    try:
        with open(safe_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        content = "".join(lines)
        
        import ast
        tree = ast.parse(content)
        
        results = []
        
        for path in node_paths:
            # path is e.g. Class.method
            parts = path.split('.')
            current_node = None
            
            # We need to find the node.
            # Simple traversal?
            # Or assume top level is module.
            
            found = False
            
            # Helper to find child with name
            def find_in_node(node, name):
                for child in ast.iter_child_nodes(node):
                    if isinstance(child, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
                        if child.name == name:
                            return child
                return None
            
            current = tree
            for part in parts:
                current = find_in_node(current, part)
                if not current:
                    break
            
            if current:
                start = current.lineno
                end = getattr(current, 'end_lineno', start)
                snippet = "".join(lines[start-1:end])
                results.append(f"## {path}\n{snippet}")
            else:
                results.append(f"## {path}\nNot found")
                
        return "\n\n".join(results)
        
    except Exception as e:
        return f"Error: {e}"

def write_to_file(target_file: str, code_content: str, overwrite: bool = False, empty_file: bool = False) -> str:
    """
    Write to a file.
    """
    safe_path = _validate_path(target_file)
        
    if os.path.exists(safe_path):
        if not overwrite:
             raise FileExistsError(f"File exists: {target_file}. Set overwrite to true to replace.")
        if os.path.isdir(safe_path):
             raise IsADirectoryError(f"Target is a directory: {target_file}")
             
    os.makedirs(os.path.dirname(safe_path), exist_ok=True)
    
    content = "" if empty_file else code_content
    
    try:
        with open(safe_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"Successfully wrote to {safe_path}"
    except Exception as e:
        raise RuntimeError(f"Error writing to file: {e}")

def replace_file_content(target_file: str, start_line: int, end_line: int, 
                         target_content: str, replacement_content: str, allow_multiple: bool = False) -> str:
    """
    Replace a contiguous block of text.
    """
    safe_path = _validate_path(target_file)
        
    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"File not found: {target_file}")

    try:
        with open(safe_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        # 1-indexed to 0-indexed
        start_idx = start_line - 1
        end_idx = end_line # Slice end is exclusive, so `end_line` covers line `end_line-1`
        
        if start_idx < 0: start_idx = 0
        if end_idx > len(lines): end_idx = len(lines)
        if start_idx >= end_idx:
             # Range is potentially empty or invalid, but maybe target_content is empty?
             pass
        
        # Extract the segment
        segment = "".join(lines[start_idx:end_idx])
        
        # Verify target content matches
        if target_content not in segment:
             raise ValueError(f"TargetContent not found in lines {start_line}-{end_line}")
             
        # Check uniqueness if not allow_multiple
        count = segment.count(target_content)
        if not allow_multiple and count > 1:
             raise ValueError(f"TargetContent found {count} times in range. Set AllowMultiple=true if intended.")
             
        # Replace
        new_segment = segment.replace(target_content, replacement_content)
        
        # Reconstruct file content
        prefix = lines[:start_idx]
        suffix = lines[end_idx:]
        
        new_content = "".join(prefix) + new_segment + "".join(suffix)
        
        with open(safe_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        return f"Successfully replaced content in {safe_path}"
            
    except Exception as e:
         raise RuntimeError(f"Error replacing content: {e}")

def multi_replace_file_content(target_file: str, replacement_chunks: List[Dict]) -> str:
    """
    Apply multiple replacements.
    Chunks: {StartLine, EndLine, TargetContent, ReplacementContent, AllowMultiple}
    """
    safe_path = _validate_path(target_file)

    # Verify file
    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"File not found: {target_file}")
        
    try:
        with open(safe_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        # Sort chunks by StartLine descending
        chunks = sorted(replacement_chunks, key=lambda x: x['StartLine'], reverse=True)
        
        last_start = float('inf')
        for chunk in chunks:
            start = chunk['StartLine']
            end = chunk['EndLine']
            if end > last_start:
                 raise ValueError(f"Overlapping chunks detected around line {end}")
            last_start = start
            
            # Apply replacement on ORIGINAL lines (subset)
            
            start_idx = start - 1
            end_idx = end
            
            segment = "".join(lines[start_idx:end_idx])
            target = chunk['TargetContent']
            replacement = chunk['ReplacementContent']
            
            if target not in segment:
                raise ValueError(f"TargetContent not found in lines {start}-{end}")
                
            new_segment = segment.replace(target, replacement)
            
            # Replace in lines
            lines[start_idx:end_idx] = [new_segment]
            
        # Write back
        new_content = "".join(lines)
        with open(safe_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        return f"Successfully applied {len(chunks)} replacements to {safe_path}"
        
    except Exception as e:
        raise RuntimeError(f"Error in multi_replace: {e}")



# Command Execution Tools

import threading
import uuid
import queue

class CommandInternal:
    def __init__(self, command_line: str, cwd: str):
        self.command_line = command_line
        self.process = subprocess.Popen(
            command_line, shell=True, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE,
            text=True, bufsize=1
        )
        self.output = []
        self.lock = threading.Lock()
        self.id = str(uuid.uuid4())
        self.finished = False
        
        # Start threads
        self.t_out = threading.Thread(target=self._read_out, daemon=True)
        self.t_out.start()
        self.t_err = threading.Thread(target=self._read_err, daemon=True)
        self.t_err.start()
        
    def _read_out(self):
        try:
            for line in self.process.stdout:
                with self.lock:
                   self.output.append(line)
        except: pass
        finally:
            self._check_finish()

    def _read_err(self):
        try:
            for line in self.process.stderr:
                with self.lock:
                   self.output.append(line)
        except: pass
        finally:
            self._check_finish()
            
    def _check_finish(self):
        if self.process.poll() is not None:
            self.finished = True

_COMMANDS: Dict[str, CommandInternal] = {}

def run_command(command_line: str, cwd: str, safe_to_auto_run: bool = False, wait_ms_before_async: int = 500) -> str:
    """
    Run a command.
    """
    safe_cwd = _validate_path(cwd)
        
    cmd = CommandInternal(command_line, safe_cwd)
    _COMMANDS[cmd.id] = cmd
    
    # Wait
    time.sleep(wait_ms_before_async / 1000.0)
    
    if cmd.finished:
        return f"Command finished immediately. ID: {cmd.id}"
    else:
        return f"Command started background. ID: {cmd.id}"

def command_status(command_id: str, output_character_count: int = 1000, wait_duration_seconds: int = 0) -> Dict:
    """
    Get command status.
    """
    cmd = _COMMANDS.get(command_id)
    if not cmd:
        raise ValueError(f"Command ID not found: {command_id}")
        
    # Wait if requested
    start = time.time()
    while wait_duration_seconds > 0:
        if cmd.finished:
            break
        if (time.time() - start) > wait_duration_seconds:
            break
        time.sleep(0.1)
        
    status = "done" if cmd.finished else "running"
    
    with cmd.lock:
        output_str = "".join(cmd.output)
        
    # Truncate logic? "OutputCharacterCount"
    output_str = output_str[-output_character_count:]
    
    return {
        "status": status,
        "output": output_str,
        "exit_code": cmd.process.returncode if cmd.finished else None
    }

def send_command_input(command_id: str, input_text: Optional[str] = None, terminate: bool = False, wait_ms: int = 500) -> str:
    """
    Send input or terminate.
    """
    cmd = _COMMANDS.get(command_id)
    if not cmd:
        raise ValueError("Command ID not found")
        
    if terminate:
        cmd.process.terminate()
        return "Terminated"
        
    if input_text:
        try:
            cmd.process.stdin.write(input_text)
            cmd.process.stdin.flush()
        except Exception as e:
            return f"Error sending input: {e}"
            
    time.sleep(wait_ms / 1000.0)
    return "Input sent"

def read_terminal(process_id: str, name: str) -> str:
    """
    Read terminal. Using command_id as process_id for consistency.
    """
    # This maps to command_status usually.
    return command_status(process_id)["output"]







