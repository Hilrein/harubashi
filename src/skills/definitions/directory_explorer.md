---
name: directory_explorer
description: Guidance for safely exploring the filesystem of a project using `system_execute_command`. No standalone tool — read this before using `dir` / `ls` / `find` to avoid expensive recursion into dependency or build directories.
---

## When to use this guidance

Whenever the user asks you to explore a codebase, locate a file, summarize a project, or answer a question that requires inspecting the file tree. The actual listing is performed via `system_execute_command`; this guidance teaches you **how** to do it efficiently and safely.

## Cross-platform listing

The host OS determines the right command:

- **POSIX (Linux, macOS)**: `ls -la <path>` for a single-level listing with hidden files and metadata.
- **Windows / cmd.exe**: `dir <path>` for the equivalent.
- **Windows / PowerShell**: `Get-ChildItem -Force <path>` or its alias `gci -Force <path>`.

If you do not yet know the OS, run `uname -a` (POSIX) or `ver` (Windows) once at the start of the session.

## Forbidden directories — never recurse into these

The following directories are large, mostly auto-generated, and almost never relevant to user questions. **Always exclude them** when doing recursive listings or searches:

- `node_modules`
- `.git`
- `.svn`, `.hg`
- `dist`, `build`, `out`, `bin`, `obj`
- `target` (Rust / Java)
- `.cache`, `.parcel-cache`, `.turbo`, `.next`, `.nuxt`
- `.venv`, `venv`, `env`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`
- `vendor` (Go / PHP)
- `coverage`, `.nyc_output`
- `.idea`, `.vscode`, `.vs`

If you must recurse, prefer tools with built-in ignore semantics:

- `git ls-files` — respects `.gitignore` automatically.
- `rg --files` (ripgrep) — respects `.gitignore` and is fast.
- `find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*'` — explicit excludes.

## Strategy: shallow first, deep only when targeted

1. **Start with the project root** at depth 1. List it with `ls -la` / `dir`. Form a mental model of the top-level layout (`src/`, `package.json`, `README.md`, etc.).
2. **Drill down by intent**, one directory at a time. Do not run `ls -laR` or `dir /s` on an unknown tree — you will drown in `node_modules` output and waste tokens.
3. **For "find the file" tasks**, prefer `git ls-files | grep <pattern>` or `rg --files | rg <pattern>`.
4. **For "find the symbol" tasks**, prefer `rg <symbol>` over reading every file.

## When in doubt

If the user asks you to "scan the entire project" without context, **ask for clarification** before running an unbounded command. Mention that you can target a subtree (e.g. `src/`) instead, which is usually what they meant.

## Examples

```
# Good — shallow listing of project root
ls -la

# Good — find all TypeScript files tracked by git
git ls-files '*.ts'

# Good — search for a symbol across source files
rg 'class AgentProcessorService'

# Bad — recursive listing that will dump node_modules
ls -laR

# Bad — find without excludes on a JS project
find . -name '*.js'
```
