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
| `browser_screenshot` | Capture viewport | Screenshot checkbox + approval modal if stream inactive |
| `browser_evaluate` | Run arbitrary JS | Evaluate checkbox |

## Screenshot Tool

`browser_screenshot` requires a live screen capture stream from the browser. If the stream is inactive (e.g. after a page refresh), the approval modal will appear in the browser tab. Ask the user to click **Allow** — the modal will re-request `getDisplayMedia()` and the screenshot will proceed.

## Multi-Session Support

If multiple browser tabs are connected, the agent must choose one:

1. Call `browser_list_sessions` → get `sessionId`, `url`, `title` for each tab
2. Pass `sessionId` in subsequent tool calls:
   ```json
   { "name": "browser_screenshot", "arguments": { "sessionId": "abc-123" } }
   ```

If only one tab is connected, `sessionId` is optional (auto-selected based on most recent activity).
