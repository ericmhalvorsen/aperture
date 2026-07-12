# MCP Capabilities

| Tool | Action | Requires |
|------|--------|----------|
| `browser_list_sessions` | List connected tabs with metadata | Nothing |
| `browser_dom_query` | CSS query DOM elements | Approval |
| `browser_page_info` | Page metadata + console logs | Approval |
| `browser_network_requests` | Audit fetch/XHR history | Approval |
| `browser_storage_get` | Read localStorage or cookies | Approval |
| `browser_click` | Fire click events | Approval |
| `browser_type` | Type into inputs | Approval |
| `browser_scroll` | Scroll page or element | Approval |
| `browser_screenshot` | Capture viewport | Screenshot checkbox in initial approval |
| `browser_evaluate` | Run arbitrary JS | Evaluate checkbox |

## Screenshot Tool

`browser_screenshot` requires a live screen capture stream from the browser. The user must enable screenshots in the initial approval dialog. If the stream becomes inactive (e.g. after a page refresh), the browser's native screen share picker will appear to re-acquire the stream — no additional Aperture modal is shown.

## Multi-Session Support

If multiple browser tabs are connected, the agent must choose one:

1. Call `browser_list_sessions` → get `sessionId`, `url`, `title` for each tab
2. Pass `sessionId` in subsequent tool calls:
   ```json
   { "name": "browser_screenshot", "arguments": { "sessionId": "abc-123" } }
   ```

If only one tab is connected, `sessionId` is optional (auto-selected based on most recent activity).
