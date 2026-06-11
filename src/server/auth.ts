// Authentication helpers: password hashing + JWT issuing/verifying.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { store } from "./db.js";
import type { PublicUser } from "../shared/protocol.js";

const JWT_SECRET = process.env.TERMCHAT_SECRET ?? "dev-insecure-secret-change-me";
const TOKEN_TTL = "30d";

export interface AuthResult {
  token: string;
  user: PublicUser;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function register(username: string, password: string): Promise<AuthResult> {
  if (!USERNAME_RE.test(username)) {
    throw new Error("Username must be 3-20 chars: letters, numbers, underscore.");
  }
  if (password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  if (store.findUserByName(username)) {
    throw new Error("That username is already taken.");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = store.createUser(username, passwordHash);
  return issue(user.id, user.username);
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const record = store.findUserByName(username);
  if (!record) throw new Error("No such user.");
  const ok = await bcrypt.compare(password, record.passwordHash);
  if (!ok) throw new Error("Wrong password.");
  return issue(record.id, record.username);
}

function issue(id: string, username: string): AuthResult {
  const token = jwt.sign({ sub: id, username }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  const record = store.findUserById(id);
  return { token, user: { id, username, publicKey: record?.publicKey || "" } };
}

export function verifyToken(token: string): PublicUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; username: string };
    // Make sure the user still exists.
    const record = store.findUserById(payload.sub);
    if (!record) return null;
    return { id: record.id, username: record.username, publicKey: record.publicKey || "" };
  } catch {
    return null;
  }
}
