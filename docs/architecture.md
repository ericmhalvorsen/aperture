# Architecture

```
Agent (opencode, Claude Code, etc.)
└── npx @ericmhalvorsen/aperture stdin
    └── Starts Aperture Server (MCP Server + WebSocket on 3456)

Your App (or any framework)
└── app/layout.tsx  → <Aperture />     → browser connects via WebSocket to localhost:3456
```

The server is an **MCP server** started by your agent. The web application is a **client** that connects to it via WebSocket. This means:
- No framework-specific configuration needed
- The agent controls the server lifecycle
- Just drop in the `<Aperture />` component or `<script>` tag and it connects automatically
