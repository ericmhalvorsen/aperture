---
"@ericmhalvorsen/aperture": minor
---

Beta release cleanup

- Remove unused `zod` dependency
- Add missing `./register` export to package.json
- Fix CI/CD workflows to use root-level Playwright config
- Fix version mismatch in MCP server initialization response
- Remove dead code (`stdio-bridge.ts`, `mock_mcp.js`)
- Strip all code comments from source
- Add `Window` type augmentation to replace `as any` casts
- Update tool descriptions to use "Agent Bridge" branding
- Fix README inaccuracies (security model, SSE URL format)
- Normalize sample app dependency linking
- Replace boilerplate sample READMEs
- Mark React peer dependencies as optional
