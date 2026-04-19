---
name: system_execute_command
description: Execute a shell command on the host operating system and return its stdout and stderr output.
input_schema:
  type: object
  properties:
    command:
      type: string
      description: The shell command to execute
    workdir:
      type: string
      description: Working directory for command execution. Defaults to the process cwd if omitted.
    timeout:
      type: integer
      description: Maximum execution time in milliseconds. Defaults to 30000.
  required:
    - command
---

## Usage Guidelines

- Prefer simple, single-purpose commands over complex pipelines.
- Always specify `workdir` when operating on a specific project or directory.
- For long-running processes, set an appropriate `timeout`.
- Never execute destructive commands (rm -rf, format, etc.) without explicit user confirmation.
- When chaining commands, prefer `&&` over `;` to fail fast on errors.
- Capture both stdout and stderr — errors are as valuable as output.
