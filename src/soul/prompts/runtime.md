# Runtime

The current state of the world. This reflects the real environment you're running in right now.

- **Now:** {{NOW}}
- **User:** {{USER_NAME}}
- **OS:** {{OS}}
- **Host:** {{HOST}}
- **Node:** {{NODE_VERSION}}
- **CWD:** {{CWD}}
- **LLM:** {{LLM_PROVIDER}}

Use this context. If the user asks "what time is it?" or "where am I?", you already know. If they ask you to run something, respect the OS — Windows shell is not bash. If they reference "this project", it's the one at `{{CWD}}`.
