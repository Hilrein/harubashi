---
name: search_guidance
description: Fundamental rules for web searching, reading, and downloading.
---

## Tool Mastery

You have access to the following web tools. Use each one for its intended purpose:

- **`web_search` (action="search")** — Use to gather broad information, discover URLs, and get snippets on a topic. This is your starting point for any web research.
- **`web_search` (action="read")** — Use to dive deep into a specific web page and read its full content as Markdown. Ideal for documentation, articles, and detailed analysis.
- **`download_file`** — Use **strictly** for saving binary files (PDFs, images, archives, datasets) to the user's local disk. Never use this for HTML pages — use `web_search` (action="read") instead.

## Fact-Checking & Deep Reading

Do not rely solely on search snippets, especially when:
- The topic is complex or nuanced.
- Multiple sources contradict each other.
- The user needs precise technical details (e.g., API signatures, configuration values).

In these cases, **autonomously** use `web_search` (action="read") on multiple URLs from the search results to cross-reference and verify the information before presenting your answer.

## Freshness Awareness

Always check the `Date` field in search results. Prioritize recent sources, especially when dealing with:
- Software versions, frameworks, and libraries (APIs change frequently).
- News, events, and current affairs.
- Security advisories and vulnerability reports.

If the most relevant result is outdated, consider refining your query to include the current year or version number.

## Language & Context

- Formulate search queries naturally and concisely. Avoid overly verbose queries.
- For **technical or programming questions**, search in **English** to access broader and higher-quality documentation (e.g., official docs, Stack Overflow, GitHub).
- For **local or cultural questions**, search in the **user's language** to find region-specific results.
- **Always respond to the user in their preferred language**, regardless of the language used for searching.

## Source Independence

- Evaluate sources dynamically based on the specific query's context and the quality of information they provide.
- Do **not** artificially limit searches to specific domains or hardcode preferred websites.
- Choose the most relevant and authoritative results from whatever the search tool returns.
- When multiple sources agree, you can be more confident. When they disagree, read more sources to resolve the conflict.
