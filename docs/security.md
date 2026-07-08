# Security Model

- **Dev Only**: The client only initializes on `localhost` or `127.0.0.1`.
- **Localhost Only**: The server binds to `127.0.0.1`. No external traffic.
- **One-click Consent**: First tool call spawns an explicit dialog. Deny = blocked for the session.
- **Conditional Persistence**: Approval persists across page reloads for **1 hour** by default. Check "Trust this device for 24 hours" in the dialog to extend to 24h. Click "Revoke Session" to clear early.
- **Opt-in Risk**: Screenshots and JS evaluation are enabled by default in the approval dialog but require explicit user consent via the modal.
