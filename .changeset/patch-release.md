---
"@ericmhalvorsen/aperture": patch
---

Refactor modal dialog infrastructure and fix release blockers

- Consolidate shared overlay, animation, and screenshot-stream logic between the approval and status dialogs
- Fix a state-mutation bug where the status dialog could modify the caller's `capabilities` array directly
- Rename `showVanillaApprovalDialog` → `showApprovalDialog`
- Remove unused `@modelcontextprotocol/sdk` and `zod` dependencies
- Fix source lint errors (template literals, non-null assertions, explicit `any` types)
- Exclude e2e tests from Vitest runner to prevent Playwright conflicts
