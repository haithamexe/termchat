// REST calls for auth, using the global fetch available in modern Node.

import type { PublicUser } from "../shared/protocol.js";

export interface AuthResult {
  token: string;
  user: PublicUser;
}

async function post(base: string, path: string, body: unknown): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(base.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach server at ${base}. Is it running?`);
  }
  const data = (await res.json().catch(() => ({}))) as Partial<AuthResult> & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as AuthResult;
}

export function register(base: string, username: string, password: string) {
  return post(base, "/api/register", { username, password });
}

export function login(base: string, username: string, password: string) {
  return post(base, "/api/login", { username, password });
}
