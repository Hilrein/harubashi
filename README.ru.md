🌍 **Читать на:** [English](README.md) | [Русский](README.ru.md)

# 🌉 Harubashi

**Headless мульти-профильный AI-агент для системного использования — глобальный npm-пакет.**

[![npm version](https://img.shields.io/npm/v/harubashi.svg?style=flat-square)](https://www.npmjs.com/package/harubashi)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache-2.0-blue.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/node/v/harubashi.svg?style=flat-square)](https://nodejs.org)

Harubashi превращает ваш терминал — и Telegram-чат — в думающий интерфейс к вашей машине. Агент выполняет shell-команды, читает файлы, управляет git и расширяется через hot-reload скиллы, которые вы пишете сами в обычном Markdown.

---

## ✨ Зачем Harubashi?

- **🔁 Мульти-профили** — разделяйте профили для work, личных задач, экспериментов. У каждого профиля свой провайдер, ключи, модель и SQLite база. Переключение одной командой.
- **🧠 Скиллы как Markdown** — положите `.md` файл в `~/.harubashi/skills/` и агент мгновенно его подхватит через hot-reload. Два типа: **Tools** (вызываемые функции) и **Guidance** (расширение system prompt).
- **🔐 Маскировка секретов в логах** — Winston файловые логи автоматически редактируют ключи NVIDIA / OpenAI / Anthropic / Google, токены Telegram-ботов и Bearer-заголовки. Daily rotation, ретенция 14 дней.
- **📡 Готов к Telegram** — запустите `harubashi daemon` и общайтесь с машиной с телефона. Или оставайтесь в терминале через `harubashi cli`.
- **🛡 Самовосстановление** — случайно удалили `~/.harubashi/skills/`? Следующий запуск демона автоматически восстановит bundled-скиллы.

---

## 📦 Установка

```bash
npm install -g harubashi
```

Требуется **Node.js ≥ 18**. После установки запустите визард настройки:

```bash
harubashi setup
```

Это создаст `~/.harubashi/`:

```
~/.harubashi/
├── config.yaml          # Все профили + активный выбор
├── databases/           # По одной SQLite базе на профиль
│   └── default.db
├── skills/              # Hot-reload Markdown скиллы
│   ├── system_execute_command.md
│   ├── system_read_file.md
│   ├── directory_explorer.md     (guidance)
│   └── git_manager.md            (guidance)
└── logs/                # Daily-rotated JSON логи
    └── harubashi-YYYY-MM-DD.log
```

---

## 🚀 Быстрый старт

```bash
# 1. Настроить первый профиль (интерактивный визард)
harubashi setup

# 2. Поговорить с агентом в терминале
harubashi cli

# 3. Или запустить как Telegram-демон (фоном)
harubashi daemon

# 4. Смотреть логи из другого терминала
harubashi logs
```

Визард спросит про LLM-провайдера (Nvidia NIM, Google Gemini; Anthropic / OpenAI / Proxy на подходе), API-ключ, модель и опционально Telegram bot token.

---

## 👤 Профили

**Профиль** — это полная личность агента: провайдер, креды, модель, опциональный Telegram-бот и выделенная SQLite база.

```bash
harubashi profile list           # Показать все профили, отметить активный
harubashi profile use work       # Переключить активный профиль
harubashi profile create staging # Визард с pre-fill из активного
harubashi profile edit work      # Визард, но пропускает init БД (только конфиг)
```

**Edit-флоу мгновенный** — если `~/.harubashi/databases/<name>.db` уже существует, визард пропускает шаг Prisma-инициализации. **Create-флоу rollback-safe** — если init БД падает, профиль *не* добавляется в `config.yaml`.

При повторном запуске `harubashi setup` (когда конфиг уже есть) появляется единый picker:

```
? Select profile to configure:
  [+] Create new profile...
❯ work (active)  · nvidia · meta/llama-3.1-70b-instruct
  staging        · google · gemini-1.5-pro
```

---

## 🧩 Скиллы

Скиллы — это Markdown-файлы в `~/.harubashi/skills/`. У каждого есть YAML frontmatter и body. **Два типа**:

### Active Tool — `input_schema` **присутствует**

Скилл регистрируется как вызываемая LLM-функция. Body становится документацией tool'а в system prompt'е.

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

- Предпочитайте простые команды сложным пайплайнам.
- Всегда указывайте `workdir` при работе с проектом.
- Никогда не запускайте деструктивные команды без явного подтверждения.
```

### Guidance-only — `input_schema` **отсутствует**

Скилл **НЕ** экспортируется как tool, но его body конкатенируется в system prompt агента под `## Guidance: <name>`. Используйте чтобы научить агента правильно использовать существующие tools.

```markdown
---
name: git_manager
description: Workflow guidance for using Git via system_execute_command.
---

## Обязательный workflow

1. **`git status`** — понять состояние перед любыми изменениями.
2. **`git diff`** — инспектировать изменения.
3. **`git add <path>`** — стейджить выборочно.
4. **`git comApache-2.0 -m "..."`** — Conventional ComApache-2.0s style.
```

### Встроенные скиллы

| Имя                        | Тип      | Назначение                                                |
|----------------------------|----------|-----------------------------------------------------------|
| `system_execute_command`   | Tool     | Выполнение shell-команд кроссплатформенно                 |
| `system_read_file`         | Tool     | Чтение файла по абсолютному пути                          |
| `directory_explorer`       | Guidance | Безопасное shallow-first исследование FS, игнор тяжёлых папок |
| `git_manager`              | Guidance | Status → diff → add → comApache-2.0; запрет деструктивных операций |

### Управление скиллами

```bash
harubashi skills list   # Красивый вывод всех скиллов, разделён на Tools / Guidance
harubashi skills open   # Открыть ~/.harubashi/skills/ в файловом менеджере ОС
```

Отредактируйте любой `.md` файл → запущенный демон подхватит изменение мгновенно через chokidar hot-reload.

### Auto-heal

Если вы удалите `~/.harubashi/skills/` (или папка останется пустой), следующий запуск демона **автоматически восстановит bundled-скиллы** из npm-пакета:

```
[SkillsService] Auto-healed skills from bundled package (4 file(s)) into ~/.harubashi/skills/
```

Демон сложно сломать. Bundled-скиллы — это read-only источник; пользовательские правки живут в home-директории.

---

## 📜 Логи

```bash
harubashi logs                     # Tail последнего лог-файла
harubashi logs --no-follow         # Напечатать и выйти
harubashi logs --lines 200         # 200 строк истории перед tail'ом
```

- **Формат файла**: построчный JSON, одна запись на строку. Daily rotation (`harubashi-YYYY-MM-DD.log`), ретенция 14 дней, лимит 20 MB на файл.
- **Console rendering**: pretty-print, цвета по уровням: `INFO` зелёный, `WARN` жёлтый, `ERROR` красный, `DEBUG` синий.
- **Маскировка секретов**: API-ключи (`nvapi-***`, `sk-***`, `AIza***`), Telegram bot tokens и `Bearer` заголовки редактируются в **обоих** transports.
- **Кроссплатформенный tail**: реализован через `chokidar` вместо `tail -f`, поэтому работает одинаково на Windows / macOS / Linux. Переход через полночь (rotation) детектится автоматически.

---

## ⚙️ Конфигурация

Единственный источник истины — `~/.harubashi/config.yaml`. Узнать абсолютный путь:

```bash
harubashi config path
```

Команда возвращает голый путь (без декораций), что отлично пайпится:

```bash
code "$(harubashi config path)"             # открыть в VS Code
cd "$(dirname "$(harubashi config path)")"  # перейти в ~/.harubashi
```

Схема (сокращённо):

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

Ручные правки приветствуются — визард просто автоматизирует то же самое.

---

## 📚 Список команд

| Команда                       | Назначение                                                           |
|-------------------------------|----------------------------------------------------------------------|
| `harubashi setup`             | Первичный визард или pick-existing-or-create при наличии конфига     |
| `harubashi cli`               | Запустить интерактивный REPL                                         |
| `harubashi daemon`            | Запустить фоновый Telegram-демон                                     |
| `harubashi logs [opts]`       | Tail дневного лога; `-n <N>`, `--no-follow`                          |
| `harubashi profile list`      | Список профилей, активный отмечен                                    |
| `harubashi profile use <name>`| Переключить активный профиль                                         |
| `harubashi profile create [name]` | Визард создания (rollback-safe, pre-fill из активного)           |
| `harubashi profile edit [name]`   | Редактирование (пропускает init БД если она есть)                |
| `harubashi skills list`       | Список установленных скиллов с разделением Tools / Guidance          |
| `harubashi skills open`       | Открыть `~/.harubashi/skills/` в файловом менеджере ОС               |
| `harubashi config path`       | Печатает абсолютный путь к `config.yaml` (pipeable)                  |
| `harubashi -V` / `--version`  | Версия пакета                                                        |

---

## 🏗 Архитектура

- **NestJS standalone application** — без HTTP-сервера; агент работает как контекст, удерживаемый `cli` или `daemon`.
- **Prisma + SQLite** — одна база на профиль в `~/.harubashi/databases/<name>.db`. Схема bundled с npm-пакетом.
- **Telegraf** — Telegram-бот интеграция (опционально, только в daemon).
- **chokidar** — file-watching для hot-reload скиллов и кроссплатформенного log tail.
- **Winston + winston-daily-rotate-file** — цветной console + JSON файловые логи с маскировкой секретов.
- **Commander** — CLI surface, ленивые динамические импорты для каждой подкоманды (быстрый cold-start).
- **Inquirer** — интерактивные визарды для setup и profile management.

---

## 🛠 Разработка

```bash
git clone https://github.com/Hilrein/harubashi.git
cd harubashi
npm install
npm run build

# Локальный бета-тест как если бы пакет был установлен глобально
npm link
harubashi setup
```

Полезные скрипты:

```bash
npm run build           # nest build
npm run lint            # eslint
npm run format          # prettier
npm run cli             # ts-node src/bin.ts cli
npm run daemon          # ts-node src/bin.ts daemon
```

---

## 📄 Лицензия

Apache-2.0 — см. [LICENSE](LICENSE).

---

<sub>Сделано с заботой. Открывайте issue, если что-то ощущается шероховато.</sub>
