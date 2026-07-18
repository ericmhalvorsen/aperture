# How It Works

```
┌──────────────────┐                               ┌─────────────────┐
│   MCP Client     │                               │   Browser Tab   │
│ (Claude, Cursor) │                               │  (<Aperture />) │
└──────────────────┘                               └─────────────────┘
         │                                                  │
         │ stdio (npx @ericmhalvorsen/aperture stdin)       │ WebSocket
         │                                                  │ (port 3456)
         ↓                                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                            Aperture Server                           │
└──────────────────────────────────────────────────────────────────────┘
```

1. **The agent starts the Aperture server** via its MCP configuration
2. **The browser connects** via WebSocket to `ws://localhost:3456/mcp` when `<Aperture />` mounts
3. **You approve** the first request per session — deny blocks the agent entirely
