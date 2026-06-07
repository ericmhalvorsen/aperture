# Release & Tagging Process

This repository uses [Changesets](https://github.com/changesets/changesets) to manage versioning, changelogs, and releases.

## 1. Prepare the Release

When you are ready to cut a release, first ensure that a changeset exists for your new code. (If you haven't created one yet, run `pnpm exec changeset` and follow the prompts to log your changes).

Once your changesets are in place, run the versioning command:

```bash
pnpm exec changeset version
```

This will automatically:
1. Consume the markdown files in `.changeset/`
2. Bump the version in `package.json`
3. Update the `CHANGELOG.md` with the release notes

After versioning, update the lockfile to reflect the new `package.json` version:
```bash
pnpm install
```

## 2. Commit the Release

Commit the version bump and changelog generation:

```bash
git add .
git commit -m "chore: release version"
```

## 3. Tag and Push

Create a git tag for the new version matching the new `package.json` version (e.g., `v0.1.2`), and push the tag to trigger CI/CD or mark the release.

```bash
# Replace X.Y.Z with the new version
git tag vX.Y.Z
git push origin main --tags
```

## 4. Publish (Optional / Manual)

If your GitHub Actions aren't configured to automatically publish on tags, you can manually build and publish to npm:

```bash
pnpm build
pnpm publish --access public
```

---

## Release Notes: Aperture v0.1.2 (Agent Bridge Update)

### Major Features & Architecture Updates
* **Agent Bridge Rebrand**: Completely updated the UI/UX language. "Aperture" has been transitioned to "Agent Bridge" across the client modal and overlay to improve clarity for end users.
* **Concurrent Root E2E Testing**: Deprecated fragmented sample-level Playwright configs. E2E testing is now handled by a single, unified root `playwright.config.ts`. The test suite dynamically assigns ports and natively boots Next.js, Vite, and Vanilla sample apps simultaneously, drastically improving test speed and DX.
* **Keep-Alive SSE Connections**: Implemented a 30s heartbeat (`: ping`) payload on the SSE transport layer to permanently fix the issue where idle remote MCP clients would silently drop their connection overnight.

### Bug Fixes & Code Health
* **Vite Plugin Port Injection**: Fixed an issue where the Vite plugin was ignoring the `APERTURE_PORT` environment variable during hot-reload. The port is now properly injected into `window.__APERTURE_PORT__` on the client side to prevent collisions.
* **CSS Isolation Fix**: Resolved a visual bug where the inherited `all: initial` CSS rule broke bullet point rendering and text visibility on dark themes inside the bridge modal.
* **Developer Hygiene**: Aggressively stripped all non-essential developer comments from the library source code to improve readability.
* **Quality & Audits**: Patched a moderate PostCSS XSS vulnerability via a root-level override. The entire repository is now strictly conforming to 0 errors and 0 warnings across `typecheck`, `biome`, `knip`, and `publint`.
