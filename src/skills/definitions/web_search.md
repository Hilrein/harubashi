---
name: web_search
description: Search the internet and read web page content for up-to-date information, news, or facts.
input_schema:
  type: object
  properties:
    action:
      type: string
      enum:
        - search
        - read
      description: "Action: 'search' to find info via Tavily API, 'read' to fetch and read a web page."
    query:
      type: string
      description: "Search query string (required when action = search)."
    url:
      type: string
      description: "URL of the web page to read (required when action = read)."
  required:
    - action
---

Use action='search' to find information via Tavily API. You will get a list of snippets and URLs. If the snippets are not enough, use action='read' with the specific URL to read the full page content. You can read multiple URLs one by one to compare sources.
