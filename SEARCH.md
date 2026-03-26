# SearXNG Search Integration

This project can expose a `web_search` tool to the Teacher Agent through a self-hosted SearXNG instance.

## What Gets Added

- Global search config: `data/search-config.json`
- Session override config: `data/<sessionId>/search-config.json`
- Teacher tool: `web_search`

The Teacher keeps using `write_file` to persist valuable search findings into `references/` or any other session file.

## Minimal Local Setup

Run a standalone SearXNG instance on your machine, for example with Docker:

```bash
docker run --name searxng -d -p 8080:8080 docker.io/searxng/searxng:latest
```

Then open the app settings and set:

- `Enable web search` = on
- `Base URL` = `http://127.0.0.1:8080`

## Config Files

Example global config:

```json
{
  "enabled": true,
  "provider": "searxng",
  "baseURL": "http://127.0.0.1:8080",
  "defaultMaxResults": 5,
  "timeoutMs": 8000,
  "allowedCategories": ["general", "it", "science", "news"],
  "allowedEngines": [],
  "persistResultsByDefault": false
}
```

Example session override:

```json
{
  "enabled": false
}
```

When a session override file is absent, the Teacher inherits the global config.

## Behavior Notes

- If global search is disabled, `web_search` returns a clear disabled error.
- Session overrides only control whether search is enabled for that session in the current UI.
- Search results are trimmed, deduplicated by URL, and returned as structured items with title, url, snippet, source, and optional published timestamp.
- `fetch_url` is intentionally not included in v1.
