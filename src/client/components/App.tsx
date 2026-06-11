import React, { useState } from "react";
import { Login } from "./Login.js";
import { Chat } from "./Chat.js";
import type { AuthResult } from "../api.js";
import { loadConfig, saveConfig, clearConfig, serverBase, wsUrl } from "../config.js";

export function App() {
  const initial = loadConfig();
  const [server] = useState(serverBase());
  const [token, setToken] = useState<string | undefined>(initial.token);

  function handleAuthed(result: AuthResult) {
    saveConfig({ token: result.token, username: result.user.username, server });
    setToken(result.token);
  }

  function handleLogout() {
    clearConfig();
    setToken(undefined);
  }

  if (!token) {
    return <Login server={server} onAuthed={handleAuthed} />;
  }
  return <Chat token={token} url={wsUrl(server)} onLogout={handleLogout} />;
}
