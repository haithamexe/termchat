# termchat

A social chat app that lives in your terminal — like IRC, but with a modern
TUI. **Ink (React for the terminal) client + Node WebSocket server**, sharing a
typed protocol.

```
 ████████╗███████╗██████╗ ███╗   ███╗
 ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
    ██║   █████╗  ██████╔╝██╔████╔██║
    ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
    ██║   ███████╗██║  ██║██║ ╚═╝ ██║
    ╚═╝   ╚══════╝╚═╝     ╚═╝     ╚═╝
```

## Features

- Real-time multi-user chat over WebSockets
- Multiple channels (`#general`, `#random`, `#tech`) — create your own with `/new`
- **End-to-End Encrypted (E2E) Direct Messages (DMs)** between friends
- **Invite-only Private Channels** for secure group conversations
- **Friends system** with requests, accepting, and removing friends
- **UI Menus (Ctrl+N)** for managing friends, requests, and DMs interactively
- **Command auto-completion** (Press Tab when typing commands like `/msg`, `/friend`)
- Username/password auth with hashed passwords (bcrypt) + JWT tokens
- Live presence ("who's online") and typing indicators
- Persistent message history (JSON file store; swap for SQLite/Postgres later)
- Colorful Ink TUI: channel sidebar, gradient banner, per-user name colors
- Token saved to `~/.config/termchat/config.json` so you stay logged in

## Architecture

```
┌─────────────┐   WebSocket (/ws)    ┌──────────────┐    ┌──────────────┐
│  Ink client │ ◄──────────────────► │  Node server │ ─► │ JSON store   │
│  (terminal) │   REST (/api/*)      │  http + ws   │    │ data/        │
└─────────────┘                      └──────────────┘    └──────────────┘
```

- `src/shared/protocol.ts` — the typed wire contract used by both sides
- `src/server/` — `http` + `ws` server, auth, the connection hub, the store
- `src/client/` — Ink components, the `useChat` WebSocket hook, crypto logic, config + REST

## Installation

You can install `termchat` globally via npm to run the client or server from anywhere:

```bash
npm install -g termchat
```

*(Note: If testing locally from source, use `npm link` instead of `-g`)*

## Running

### 1. The Server

Start your own chat server locally (or on a VPS):

```bash
termchat-server
```
By default, it listens on port `8080` and stores data in `data/store.json`.

### 2. The Client

Connect to a server (defaults to `http://localhost:8080`):

```bash
termchat
```

If the server is hosted elsewhere, set the environment variable:
```bash
TERMCHAT_SERVER=https://chat.example.com termchat
```

## In-app controls

| Input              | Action                          |
| ------------------ | ------------------------------- |
| `Ctrl+N`           | **Open Interactive Menu (Friends/DMs)** |
| `Tab` / `Shift+Tab`| Cycle channels OR Auto-complete commands |
| `Ctrl+Q`           | Quit                            |
| `/new <name>`      | Create a channel                |
| `/join <name>`     | Switch to a channel             |
| `/msg <user>`      | Start an E2E Encrypted DM       |
| `/friend add <usr>`| Send a friend request           |
| `/invite <user>`   | Invite user to a private channel|
| `/logout`          | Sign out                        |
| `/quit`            | Exit                            |

## Configuration

| Env var            | Default                  | Used by |
| ------------------ | ------------------------ | ------- |
| `PORT`             | `8080`                   | server  |
| `TERMCHAT_SECRET`  | dev secret (change it!)  | server  |
| `TERMCHAT_DATA`    | `data/store.json`        | server  |
| `TERMCHAT_SERVER`  | `http://localhost:8080`  | client  |

## Development (from source)

```bash
npm install
npm run build

# Terminal 1 — start the server
npm run dev:server

# Terminal 2 — open a client
npm run dev:client
```
# termchat
