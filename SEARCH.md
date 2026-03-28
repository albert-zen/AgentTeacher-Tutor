# Tool Manager And Managed Web Search

This branch upgrades the old standalone search configuration into a unified Tool Manager.

## What Gets Added

- Global tool config: `data/tool-config.json`
- Session tool overrides: `data/<sessionId>/context-config.json`
- Tool metadata and prompt fragments: `data/tools/<toolId>.json` and `data/tools/<toolId>.md`
- Managed local `web_search` sidecar with lazy start

The v1 Tool Manager actively manages three tools:

- `read_file`
- `write_file`
- `web_search`

`browser` exists only as a reserved definition for future work and is not exposed in the UI or model tool registry yet.

## How It Works

- Tool enablement is resolved as `global default + session override`.
- Enabled tools are injected into the context compiler via:
  - `<enabled_tools>`
  - `<tool_instructions>`
- Disabled tools are removed from both prompt injection and runtime tool registration.
- `web_search` can run in:
  - `managed` mode: use the local sidecar on `127.0.0.1:<port>`
  - `external` mode: call the upstream search provider directly

## Default Web Search Runtime

By default, `web_search` is configured as:

```json
{
  "enabledByDefault": false,
  "runtimeMode": "managed",
  "sidecar": {
    "port": 18080
  },
  "backend": {
    "port": 18081
  },
  "upstream": {
    "provider": "searxng",
    "remoteBaseURL": "http://127.0.0.1:8080"
  },
  "timeoutMs": 8000,
  "defaultMaxResults": 5,
  "allowedCategories": ["general", "it", "science", "news"],
  "allowedEngines": [],
  "persistResultsByDefault": false
}
```

In `managed` mode, the local backend and sidecar are started lazily on first actual `web_search` execution.

The backend exposes:

- `GET /health`
- `POST /search`

The sidecar exposes:

- `GET /health`
- `POST /search`

The backend owns remote provider access, while the sidecar remains the tool-facing adapter. Tool Manager now supervises both processes so the app can report whether the managed search stack is actually ready.

## Migration Notes

- Old `data/search-config.json` values are migrated into `tool-config.json.tools.web_search` when read.
- Legacy `/api/search-config` endpoints still work as compatibility aliases, but the new UI uses `/api/tools` and `/api/session/:id/tools`.

## Persistence Notes

- Tool prompt fragments live in `data/tools/` so they stay editable and align with the app's “Everything is a file” direction.
- Search findings are still persisted through `write_file` into `references/` or any other session file.
- `fetch_url` is intentionally still out of scope for this branch.
