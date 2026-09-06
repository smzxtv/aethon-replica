# Aethon Replica

A from-scratch, staged reimplementation of the *Aethon* VPN client
(independent Windows + Android frontend for the sing-box networking core).

This project is a independent reimplementation with its own name and does **not**
bundle the upstream *Aether* core. The network engine and routing engine is
[sing-box](https://github.com/SagerNet/sing-box) (GPL-3.0), fetched by
`npm run fetch:core`.

## Status / roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| 0 | Windows skeleton: Tauri v2 + React shell, three-part navigation, core fetch script | ✅ done |
| 1 | SOCKS5 mode (`127.0.0.1:1819`) + VPN mode (TUN + protected routes), connect/disconnect, UAC elevation, live diagnostics | 🔧 coded — SOCKS5 verified end-to-end; VPN config syntax verified, runtime test needs admin |
| 2 | Configurations persistence (done), split tunneling, auto-update (12 h) + manual check, SHA-256 + download, MSI/NSIS/portable packaging | 🔧 in progress |
| 3 | Android: native Kotlin + `VpnService`, Quick Settings tile, RTL (fa/en) | ⏳ |
| 4 | Multi-arch Android packaging, `SHA256SUMS.txt`, GitHub Actions release pipeline | ⏳ |

## Quick start (Windows)

Prerequisites: Node.js 22+, Rust stable (`x86_64-pc-windows-msvc`), MSVC Build
Tools, WebView2 runtime, WiX toolset (for MSI builds).

```powershell
npm ci
npm run fetch:core      # verified sing-box binary -> src-tauri/resources/sing-box
npm test                # typecheck + frontend build
npm run tauri dev
```

Windows release output is written under `src-tauri/target/release`.

## Project layout

```
src/                  Windows frontend (React + TS)
src-tauri/            Windows native process, routing, settings, updater (Rust)
android/              Native Android client (Stage 3)
scripts/              Verified dependency fetch + release packaging
.github/workflows/    CI / release pipeline (Stage 4)
```

## Update source configuration

Both clients poll the latest GitHub Release endpoint:

```
https://api.github.com/repos/<owner>/<repo>/releases/latest
```

Expected assets:

- `AethonReplica-v<version>-Windows-x64-Installer.exe`
- `AethonReplica-v<version>-Android-Universal.apk`
- `SHA256SUMS.txt` (or GitHub digest)
- Release notes in the release body

## Attribution & licence

Independent project — not affiliated with Aethon / Aether. sing-box is
GPL-3.0. See `LICENSE` / `NOTICE.md` / `TRADEMARK.md` for details.
