# Desktop connection

The Windows client launches the **bundled official Codex CLI** as a child process and speaks the documented app-server protocol over standard input/output. The browser build has no local credential proxy and cannot start the desktop connection bridge.

Windows x64 builds include the official CLI; no separate CLI installation is normally required. If the bundled component is missing, the app searches the environment and common installation locations. `SUPER_CODEX_CLI_PATH` can identify a fallback executable; it is a launch-time environment setting, not renderer input.

Choose **Connect Codex** in the app and finish the official ChatGPT authorization in the system browser. Super Codex uses its own `codex-home` inside Electron's application data directory. It does not copy, inspect, export, or modify the host Codex client's credentials. The official CLI owns credential storage and refresh. ChatGPT authentication and model availability depend on the account; a catalog entry alone does not prove inference entitlement.

The flow uses `initialize`, `account/read`, `account/login/start`, `model/list`, `thread/start`, `thread/resume`, `turn/start`, and `turn/interrupt`. Agent text streams through `item/agentMessage/delta`. Conversation IDs support real multi-turn continuation after reopening the application. Fictional names are presentation instructions; only catalog IDs are forwarded as the real model. Unsupported reasoning settings fall back to the real model's documented default. Demo speed never accelerates the real service.

The client is conversation-only. Shell tools and connected apps are disabled; turns use the read-only sandbox with network access disabled for tools; all server approval requests are declined. The renderer has no Node integration, filesystem API, generic IPC, arbitrary command execution, or credential access. Its exposed IPC methods are fixed and validated against the main frame. Membership purchases and the mechanical quota reset never call Codex account APIs.

## Validation

- `node --test tests/bridge.test.mjs` runs mock transport, authorization-host, catalog selection, stream, history, cancellation, timeout, and permission-denial tests without account access.
- The installed `codex-cli 0.165.0-alpha.1.2` was checked on 2026-10-28 with a temporary isolated home. Initialization and `account/read` succeeded and correctly reported a signed-out Demo state. No real login or model inference was performed as part of that check.
- A complete live OAuth and inference test requires the user to sign in. Unit tests are not proof of live account access.

Protocol references: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [authentication](https://learn.chatgpt.com/docs/auth), and [configuration](https://learn.chatgpt.com/docs/config-file/config-reference). This is a local, noncommercial, open-source concept client. App-server account authentication must not be turned into a hosted account-token relay.
