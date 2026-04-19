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

## Tech Stack

- **Runtime**: Node.js + NestJS
- **Database**: SQLite via Prisma
- **LLM**: Anthropic / OpenAI / Google Gemini (OAuth 2.0) / Proxy
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
└── messages/     # Message persistence
```
