// Persists the auth token + server URL under the user's home config dir,
// mirroring how tools like the Claude CLI keep credentials in ~/.config.

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import type { KeyPair } from "./crypto.js";

export interface Config {
  token?: string;
  username?: string;
  server?: string; // http base, e.g. http://localhost:8080
  keyPair?: KeyPair;
  theme?: Record<string, string>;
  blocked?: string[];
}

const CONFIG_DIR = join(homedir(), ".config", "termchat");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = loadConfig();
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2), "utf8");
}

export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    const { server } = loadConfig();
    writeFileSync(CONFIG_FILE, JSON.stringify({ server }, null, 2), "utf8");
  }
}

export function serverBase(): string {
  return (
    process.env.TERMCHAT_SERVER ??
    loadConfig().server ??
    "http://localhost:8080"
  );
}

export function wsUrl(httpBase: string): string {
  return httpBase.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";
}
