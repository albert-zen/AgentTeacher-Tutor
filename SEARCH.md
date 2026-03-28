# Tool Manager And Managed Web Search

This branch upgrades the old standalone search configuration into a unified Tool Manager.

## What Gets Added

- Global tool config: `data/tool-config.json`
- Session tool overrides: `data/<sessionId>/context-config.json`
- Tool metadata and prompt fragments: `data/tools/<toolId>.json` and `data/tools/<toolId>.md`
- Managed `web_search` runtime with lazy start

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
  - `local` mode: start a local search backend plus the tool-facing interface sidecar
  - `external` mode: start only the tool-facing interface sidecar and have it call a remote SearXNG-compatible endpoint

## Default Web Search Runtime

By default, `web_search` is configured as:

```json
{
  "enabledByDefault": false,
  "runtimeMode": "local",
  "localProvider": "duckduckgo",
  "sidecar": {
    "port": 18080
  },
  "backend": {
    "port": 18081
  },
  "externalBaseURL": "http://127.0.0.1:8080",
  "timeoutMs": 8000,
  "defaultMaxResults": 5,
  "allowedCategories": ["general", "it", "science", "news"],
  "allowedEngines": [],
  "persistResultsByDefault": false
}
```

In `local` mode, the backend and sidecar are started lazily on first actual `web_search` execution.

- Backend: local search service, currently backed by DuckDuckGo HTML search
- Sidecar: the stable interface layer used by the Teacher tool

The backend exposes:

- `GET /health`
- `POST /search`

The sidecar exposes:

- `GET /health`
- `POST /search`

In `external` mode, only the sidecar is started. The sidecar then calls `externalBaseURL` for live search results.

Tool Manager now supervises:

- local mode: backend + sidecar
- external mode: sidecar only

This means the UI maps to the product semantics directly:

- choosing local means “start my local search stack”
- choosing external means “only start the adapter layer and connect it to an existing remote search endpoint”

## Migration Notes

- Old `data/search-config.json` values are migrated into `tool-config.json.tools.web_search` when read.
- Older `managed` runtime values are normalized to `local`.
- Older `upstream.remoteBaseURL` values are normalized to `externalBaseURL`.
- Legacy `/api/search-config` endpoints still work as compatibility aliases, but the new UI uses `/api/tools` and `/api/session/:id/tools`.

## Persistence Notes

- Tool prompt fragments live in `data/tools/` so they stay editable and align with the app's “Everything is a file” direction.
- Search findings are still persisted through `write_file` into `references/` or any other session file.
- `fetch_url` is intentionally still out of scope for this branch.
