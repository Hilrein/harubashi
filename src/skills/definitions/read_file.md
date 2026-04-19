---
name: system_read_file
description: Read the contents of a file at the specified absolute path. Returns the file content as a UTF-8 string.
input_schema:
  type: object
  properties:
    path:
      type: string
      description: Absolute path to the file to read
    encoding:
      type: string
      description: File encoding. Defaults to utf-8.
    maxBytes:
      type: integer
      description: Maximum number of bytes to read. Omit to read the entire file.
  required:
    - path
---

## Usage Guidelines

- Always use absolute paths to avoid ambiguity.
- For binary files, the content may be truncated or unreadable — prefer `execute_command` with `xxd` or `file` for binary inspection.
- Use `maxBytes` for very large files to avoid memory issues.
- Check if the file exists before attempting to read when unsure.
