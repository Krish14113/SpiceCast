# WhatsApp Broadcast

A local desktop app for preparing contacts, importing CSV files, sending personalised WhatsApp broadcasts, and retaining a per-message audit history.

> **Important:** this app uses the unofficial `whatsapp-web.js` library and is not endorsed by WhatsApp or Meta. Automated sending can lead to restrictions or account bans. Use only with contacts who expect to hear from you, keep volumes conservative, and use the built-in randomized delays.

## What it does

- Link one WhatsApp account by scanning a QR code.
- Store contacts, lists and settings locally on the employee’s computer.
- Import CSV files with `name`/`full name`, `phone`/`phone number`/`mobile`/`number`, and optional `list`/`group`/`tag` headers.
- Preview invalid numbers and existing contacts before importing.
- Send sequential personalised text messages using `{{name}}` and `{{firstName}}`.
- Pause, resume, or stop an active campaign; use dry-run mode to rehearse without sending.
- Keep append-only campaign and recipient logs locally.

## Run locally

Requires Node.js 22+ and Google Chrome or Microsoft Edge.

```bash
npm install
npm run dev
```

The first real connection opens WhatsApp Web and presents a QR code. Scan it in WhatsApp: **Settings → Linked devices → Link a device**.

## Build and package

```bash
npm run build
npm run package:dir
npm run package
```

The Windows installer is built in GitHub Actions by `.github/workflows/build-windows.yml`. Push a `v*` tag or run that workflow manually, then download the generated `.exe` artifact.

## Data location

Electron stores the app’s data in its user-data directory. It contains `data.json`, `history/campaigns.jsonl`, `history/messages.jsonl`, and the linked WhatsApp session under `sessions/`. Use **Settings → Reveal data folder** to open it.

## Operational guidance

Keep the delay range at a human pace (the default is 8–20 seconds), send only to opted-in saved clients, and begin with a small test audience. If QR linking fails after a WhatsApp Web update, update the dependency and retry. If Chrome is installed in a non-standard location, specify its executable path in Settings.
