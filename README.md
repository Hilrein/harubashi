# Harubashi

Headless System Use Agent daemon. Controls the host system exclusively through shell commands and filesystem operations.

## Quick Start

```bash
# Install dependencies
npm install

# Generate Prisma client & create database
npx prisma generate
npx prisma migrate dev --name init

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Start in development mode
npm run start:dev
```

## Channels

Harubashi supports two interaction channels out of the box: **CLI** and **Telegram**. Both share the same agent, database, sessions, and message history.

### CLI

```bash
npm run cli
```

In-REPL commands:

- `/new <name>` — create or switch to a new session
- `/switch <name>` — switch to an existing session
- `/sessions` — list all sessions
- `exit` / `quit` — shut down

### Telegram

The Telegram channel is a **device-pairing** bot. Only one Telegram account can be paired to a running daemon; all other senders are ignored.

#### 1. Create a bot

1. Open a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, follow the prompts.
3. Copy the **bot token** (looks like `123456789:ABC...`).

#### 2. Configure the daemon

Add to `.env`:

```dotenv
TELEGRAM_BOT_TOKEN=123456789:ABC...
```

#### 3. Start the daemon

```bash
npm run daemon          # ts-node (dev)
npm run daemon:build    # nest build → node dist/daemon.js (prod)
```

On first launch, the daemon prints a one-time **9-character pairing code** to the server console:

```
╔══════════════════════════════════════════════════════╗
║  Bot is not paired!                                  ║
║  Send this command to the Telegram bot to connect:   ║
║                                                      ║
║    /pair A2QFNFHIH                                   ║
║                                                      ║
║  Code expires in 5 minutes.                          ║
╚══════════════════════════════════════════════════════╝
```

#### 4. Pair your device

In Telegram, open your bot and send:

```
/pair A2QFNFHIH
```

On success the bot replies `✅ Successfully paired!` and your Telegram ID is stored in the database (`User.telegramId`). The pairing persists across daemon restarts — you do **not** need to pair again.

#### 5. Use the bot

After pairing, send any message to trigger the agent. When the agent needs to run a non-whitelisted shell command, it will send an inline-keyboard prompt:

```
⚠️ Agent wants to execute:
    $ rm -rf ./build
Allow?     [ ✅ Yes ]  [ ❌ No ]
```

Slash commands (also available from the Menu button):

| Command | Description |
| --- | --- |
| `/start` | Show welcome and pairing status |
| `/pair <code>` | Pair device with Harubashi |
| `/new <name>` | Create or switch to a new session |
| `/switch <name>` | Switch to an existing session |
| `/sessions` | List all active sessions |

Each Telegram chat has its own default session (`tg-<chatId>`). Sessions are shared with the CLI — you can start a conversation in Telegram and continue it via `npm run cli` + `/switch tg-<chatId>`.

#### Re-pairing

To pair a different Telegram account, clear the stored ID in the database:

```bash
npx prisma studio
# → User table → set telegramId = null on the default user
```

Then restart the daemon. A new pairing code will be printed.

## Tech Stack

- **Runtime**: Node.js + NestJS
- **Database**: SQLite via Prisma
- **LLM**: Anthropic / OpenAI / Google Gemini (OAuth 2.0) / NVIDIA NIM / Proxy (any OpenAI-compatible endpoint)
- **Skills**: Markdown-defined tools with frontmatter schemas
- **Soul**: Markdown system prompts

## Project Structure

```
src/
├── common/       # Shared types and utilities
├── config/       # Environment configuration
├── prisma/       # Database service
├── soul/         # System prompts (markdown)
├── skills/       # Tool definitions (markdown + chokidar)
├── llm/          # LLM provider adapters
├── agent/        # Core agent loop
├── tasks/        # Task management
├── messages/     # Message persistence
└── telegram/     # Telegram gateway (bot, pairing, adapter)
```

Entry points:

- `src/main.ts` — default NestJS HTTP app
- `src/cli.ts` — interactive CLI (`npm run cli`)
- `src/daemon.ts` — headless daemon that hosts the Telegram bot (`npm run daemon`)
