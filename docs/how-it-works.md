# How It Works

```
┌─────────────────┐      WebSocket       ┌──────────────────┐
│   Browser Tab   │ ←──────────────────→ │  Aperture Server │
│  (<Aperture />) │   (dev sidecar)      │   (port 3456)    │
└─────────────────┘                      └──────────────────┘
                                                 │
                                                 │ SSE / HTTP
                                                 │ (MCP remote)
                                                 ↓
                                         ┌──────────────────┐
                                         │   MCP Client     │
                                         │  (OpenCode, etc) │
                                         └──────────────────┘
```

1. **Your app starts the Aperture server** as a dev sidecar (via `withAperture()`, Vite plugin, or manual)
2. **The browser connects** via WebSocket when `<Aperture />` mounts
3. **The agent connects** via SSE over HTTP to the already-running server
4. **You approve** the first request per session — deny blocks the agent entirely
