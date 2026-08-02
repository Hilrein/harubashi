---
name: download_file
description: Download a file from the given URL and save it to disk. Use ONLY for actual files (PDF, archives, images, etc.), not for reading HTML pages.
input_schema:
  type: object
  properties:
    url:
      type: string
      description: "URL of the file to download."
    filename:
      type: string
      description: "Desired filename with extension. If omitted, the system will try to determine it automatically."
  required:
    - url
---

Use this tool to download files such as PDFs, images, archives, or other binary content.
Do NOT use this for reading web pages — use web_search with action='read' instead.
The file will be saved to the Harubashi downloads directory (~/.harubashi/downloads/).
