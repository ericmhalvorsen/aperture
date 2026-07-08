# Architecture

```
Your App (or any framework)
├── next.config.ts  → withAperture()   → starts server on port 3456
├── app/layout.tsx  → <Aperture />     → browser connects via WebSocket
│
└── Agent (opencode, Claude Code, etc.)
    └── SSE connection to http://localhost:3456/sse
```

The server is a **dev sidecar** owned by your app. The agent is a **client** that connects to it via SSE. This means:
- One `pnpm dev` starts everything
- No "server not running" errors from the agent
- The server lifecycle matches your app, not the agent
- No stdio bridge process to manage or restart
