# Debugging

If you're integrating Aperture with a new MCP client or framework and need to see the raw HTTP/SSE traffic (e.g. to diagnose session timeouts or URL resolution issues):

- **Standalone Mode**: Run with the verbose flag: `npx @ericmhalvorsen/aperture -v` or `aperture -v`.
- **Standalone Server**: The server logs basic HTTP requests (`[Aperture HTTP] GET /sse`) and session connect/disconnect events to stderr. When spawned via an MCP client, these logs are inherited by the parent process so you can view them directly in your MCP client's terminal or log viewer.
