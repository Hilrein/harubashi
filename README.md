🌍 **Read in:** [English](README.md) | [Русский](README.ru.md)

# 🌉 Harubashi

**A headless, multi-profile system-use AI agent — installable as a global npm package.**

[![npm version](https://img.shields.io/npm/v/harubashi.svg?style=flat-square)](https://www.npmjs.com/package/harubashi)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache-2.0-blue.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/node/v/harubashi.svg?style=flat-square)](https://nodejs.org)

Harubashi turns your terminal — and your Telegram chat — into a thinking interface to your machine. It executes shell commands, reads files, manages git, and grows with hot-reloadable skills you can write yourself in plain Markdown.

---

## ✨ Why Harubashi?

- **🔁 Multi-profile** — keep separate profiles for work, personal, experiments. Each profile has its own provider, API keys, model, and SQLite database. Switch with one command.
- **🧠 Skills as Markdown** — drop a `.md` file into `~/.harubashi/skills/` and the agent picks it up instantly via hot-reload. Two kinds: **Tools** (callable functions) and **Guidance** (system-prompt augmentation).
- **🔐 Secret-masked logs** — Winston file logs redact NVIDIA / OpenAI / Anthropic / Google keys, Telegram bot tokens, and Bearer headers automatically. Daily rotation, 14-day retention.
- **📡 Telegram-ready** — run `harubashi daemon` and chat with your machine from your phone. Or stay in the terminal with `harubashi cli`.
- **🛡 Auto-healing** — accidentally delete `~/.harubashi/skills/`? The next daemon boot restores the bundled skills automatically.

---

## 📦 Installation

```bash
npm install -g harubashi
```

Requires **Node.js ≥ 18**. The first time you launch any command after install, run the setup wizard:

```bash
harubashi setup
```

This creates `~/.harubashi/` containing:

```
~/.harubashi/
├── config.yaml          # All profiles + active selection
├── databases/           # One SQLite file per profile
│   └── default.db
├── skills/              # Hot-reloadable Markdown skills
│   ├── system_execute_command.md
│   ├── system_read_file.md
│   ├── directory_explorer.md     (guidance)
│   └── git_manager.md            (guidance)
└── logs/                # Daily-rotated JSON logs
    └── harubashi-YYYY-MM-DD.log
```

---

## 🚀 Quick Start

```bash
# 1. Configure your first profile (interactive wizard)
harubashi setup

# 2. Talk to the agent in your terminal
harubashi cli

# 3. Or run as a Telegram daemon (background)
harubashi daemon

# 4. Tail the logs from another terminal
harubashi logs
```

The wizard asks for your LLM provider (Nvidia NIM, Google Gemini, with Anthropic / OpenAI / Proxy coming soon), an API key, a model, and optionally a Telegram bot token.

---

## 👤 Profiles

A **profile** is a complete agent identity: provider, credentials, model, optional Telegram bot, and a dedicated SQLite database.

```bash
harubashi profile list           # Show all profiles, mark the active one
harubashi profile use work       # Switch active profile
harubashi profile create staging # Wizard with pre-fill from active profile
harubashi profile edit work      # Wizard, but skips DB init (config-only edit)
```

The **edit flow is instant** — if `~/.harubashi/databases/<name>.db` already exists, the wizard skips the Prisma init step. The **create flow is rollback-safe** — if database initialization fails, the profile is *not* added to `config.yaml`.

Re-running `harubashi setup` when a config exists shows a unified picker:

```
? Select profile to configure:
  [+] Create new profile...
❯ work (active)  · nvidia · meta/llama-3.1-70b-instruct
  staging        · google · gemini-1.5-pro
```

---

## 🧩 Skills

Skills are Markdown files in `~/.harubashi/skills/`. Each one has a YAML frontmatter and a body. There are **two kinds**:

### Active Tool — `input_schema` is **present**

The skill is registered as a callable LLM function. The body becomes the tool's documentation in the system prompt.

```markdown
---
name: system_execute_command
description: Execute a shell command on the host OS.
input_schema:
  type: object
  properties:
    command:
      type: string
      description: The shell command to execute
  required: [command]
---

## Usage Guidelines

- Prefer simple commands over complex pipelines.
- Always specify `workdir` when operating on a project.
- Never run destructive commands without explicit user confirmation.
```

### Guidance-only — `input_schema` is **absent**

The skill is **not** exposed as a tool, but its body is concatenated into the agent's system prompt under `## Guidance: <name>`. Use this to teach the agent how to wield existing tools.

```markdown
---
name: git_manager
description: Workflow guidance for using Git via system_execute_command.
---

## The mandatory workflow

1. **`git status`** — understand state before any mutation.
2. **`git diff`** — inspect changes.
3. **`git add <path>`** — stage selectively.
4. **`git comApache-2.0 -m "..."`** — Conventional ComApache-2.0s style.
```

### Built-in skills

| Name                       | Kind     | Purpose                                               |
|----------------------------|----------|-------------------------------------------------------|
| `system_execute_command`   | Tool     | Run shell commands cross-platform                     |
| `system_read_file`         | Tool     | Read a file by absolute path                          |
| `directory_explorer`       | Guidance | Safe, shallow-first FS exploration; ignore heavy dirs |
| `git_manager`              | Guidance | Status → diff → add → comApache-2.0; forbid destructive ops  |

### Manage skills

```bash
harubashi skills list   # Pretty-print all skills, split by Tools / Guidance
harubashi skills open   # Open ~/.harubashi/skills/ in the OS file manager
```

Edit any `.md` file → the running daemon picks up the change instantly via chokidar hot-reload.

### Auto-heal

If you delete `~/.harubashi/skills/` (or it ends up empty), the next daemon boot **restores the bundled skills** from the npm package automatically:

```
[SkillsService] Auto-healed skills from bundled package (4 file(s)) into ~/.harubashi/skills/
```

This means the daemon is hard to break. Bundled skills are read-only sources; user edits live in the home directory.

---

## 📜 Logs

```bash
harubashi logs                     # Tail the latest log file
harubashi logs --no-follow         # Print and exit
harubashi logs --lines 200         # 200 lines of history before tailing
```

- **File format**: line-deliApache-2.0ed JSON, one record per line. Daily rotation (`harubashi-YYYY-MM-DD.log`), 14-day retention, 20 MB cap per file.
- **Console rendering**: pretty-printed, colored by level: `INFO` green, `WARN` yellow, `ERROR` red, `DEBUG` blue.
- **Secret masking**: API keys (`nvapi-***`, `sk-***`, `AIza***`), Telegram bot tokens, and `Bearer` headers are redacted in **both** transports.
- **Cross-platform tail**: implemented via `chokidar` instead of `tail -f`, so it works the same on Windows / macOS / Linux. Day-rollover is detected automatically.

---

## ⚙️ Configuration

The single source of truth is `~/.harubashi/config.yaml`. Find its absolute path:

```bash
harubashi config path
```

This eApache-2.0s the bare path (no decoration), so it pipes cleanly:

```bash
code "$(harubashi config path)"             # open in VS Code
cd "$(dirname "$(harubashi config path)")"  # cd into ~/.harubashi
```

Schema (abbreviated):

```yaml
activeProfile: work
profiles:
  work:
    llmProvider: nvidia               # nvidia | google | anthropic | openai | proxy
    providers:
      nvidia:
        apiKey: nvapi-***
        model: meta/llama-3.1-70b-instruct
    telegram:
      enabled: true
      botToken: ***
  staging:
    llmProvider: google
    providers:
      google:
        apiKey: AIza***
        model: gemini-1.5-pro
```

Manual edits are fine; the wizard simply automates them.

---

## 📚 Command Reference

| Command                       | Purpose                                                              |
|-------------------------------|----------------------------------------------------------------------|
| `harubashi setup`             | First-time wizard, or pick-existing-or-create when config exists     |
| `harubashi cli`               | Launch the interactive REPL                                          |
| `harubashi daemon`            | Launch the Telegram-facing background daemon                         |
| `harubashi logs [opts]`       | Tail the daily log; `-n <N>`, `--no-follow`                          |
| `harubashi profile list`      | List profiles, mark the active one                                   |
| `harubashi profile use <name>`| Switch active profile                                                |
| `harubashi profile create [name]` | Wizard for a new profile (rollback-safe, pre-fill from active)   |
| `harubashi profile edit [name]`   | Edit an existing profile (skips DB init when DB exists)          |
| `harubashi skills list`       | List installed skills, split by Tools and Guidance                   |
| `harubashi skills open`       | Open `~/.harubashi/skills/` in the OS file manager                   |
| `harubashi config path`       | Print the absolute path to `config.yaml` (pipeable)                  |
| `harubashi -V` / `--version`  | Print the package version                                            |

---

## 🏗 Architecture

- **NestJS standalone application** — no HTTP server; the agent runs as a context held by `cli` or `daemon`.
- **Prisma + SQLite** — one database per profile under `~/.harubashi/databases/<name>.db`. Schema bundled with the npm package.
- **Telegraf** — Telegram bot integration (optional, daemon-only).
- **chokidar** — file-watching for skills hot-reload and the cross-platform log tail.
- **Winston + winston-daily-rotate-file** — colored console + JSON file logs with secret masking.
- **Commander** — CLI surface, lazy dynamic imports per subcommand for fast cold-start.
- **Inquirer** — interactive wizards for setup and profile management.

---

## 🛠 Development

```bash
git clone https://github.com/Hilrein/harubashi.git
cd harubashi
npm install
npm run build

# Local beta-test as if it were globally installed
npm link
harubashi setup
```

Useful scripts:

```bash
npm run build           # nest build
npm run lint            # eslint
npm run format          # prettier
npm run cli             # ts-node src/bin.ts cli
npm run daemon          # ts-node src/bin.ts daemon
```

---

## 📄 License

Apache-2.0 — see [LICENSE](LICENSE).

---

<sub>Made with care. Open an issue if anything feels rough.</sub>
