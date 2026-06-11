// A tiny zero-dependency JSON-file store. Good enough for a v1 / demo.
// Swap this module for SQLite or Postgres later without touching the hub.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage, Channel, FriendRequest, PublicUser } from "../shared/protocol.js";

interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  publicKey?: string;
  friends: string[]; // Array of friend usernames
  createdAt: number;
}

interface Snapshot {
  users: UserRecord[];
  channels: Channel[];
  messages: ChatMessage[];
  friendRequests: FriendRequest[];
}

const DATA_FILE = resolve(process.env.TERMCHAT_DATA ?? "data/store.json");
const MAX_MESSAGES_PER_CHANNEL = 500;

const DEFAULT_CHANNELS: Channel[] = [
  { name: "general", topic: "Say hi 👋", isPrivate: false },
  { name: "random", topic: "Anything goes", isPrivate: false },
  { name: "tech", topic: "Terminals, code, and keyboards", isPrivate: false },
];

class Store {
  private data: Snapshot;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (existsSync(DATA_FILE)) {
      try {
        this.data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Snapshot;
      } catch {
        this.data = { users: [], channels: [...DEFAULT_CHANNELS], messages: [], friendRequests: [] };
      }
    } else {
      this.data = { users: [], channels: [...DEFAULT_CHANNELS], messages: [], friendRequests: [] };
    }
    if (this.data.channels.length === 0) this.data.channels = [...DEFAULT_CHANNELS];
    if (!this.data.friendRequests) this.data.friendRequests = [];
    
    // Migrate existing users
    let migrated = false;
    for (const u of this.data.users) {
      if (!u.friends) { u.friends = []; migrated = true; }
    }
    if (migrated) this.persist();
  }

  // --- persistence ---------------------------------------------------------
  private persist() {
    // Debounce writes so a burst of messages doesn't hammer the disk.
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), "utf8");
    }, 250);
  }

  // --- users ---------------------------------------------------------------
  findUserByName(username: string): UserRecord | undefined {
    const lower = username.toLowerCase();
    return this.data.users.find((u) => u.username.toLowerCase() === lower);
  }

  findUserById(id: string): UserRecord | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  createUser(username: string, passwordHash: string): UserRecord {
    const user: UserRecord = {
      id: randomUUID(),
      username,
      passwordHash,
      friends: [],
      createdAt: Date.now(),
    };
    this.data.users.push(user);
    this.persist();
    return user;
  }

  updateUserPublicKey(username: string, publicKey: string) {
    const user = this.findUserByName(username);
    if (user) {
      user.publicKey = publicKey;
      this.persist();
    }
  }

  getAllPublicUsers(): PublicUser[] {
    return this.data.users.map(u => ({ id: u.id, username: u.username, publicKey: u.publicKey || '' }));
  }

  getFriendsFor(username: string): PublicUser[] {
    const user = this.findUserByName(username);
    if (!user) return [];
    return user.friends
      .map(f => this.findUserByName(f))
      .filter((u): u is UserRecord => !!u)
      .map(u => ({ id: u.id, username: u.username, publicKey: u.publicKey || '' }));
  }

  // --- friends -------------------------------------------------------------
  getFriendRequestsFor(username: string): FriendRequest[] {
    const lower = username.toLowerCase();
    return this.data.friendRequests.filter(r => r.toUsername.toLowerCase() === lower || r.fromUsername.toLowerCase() === lower);
  }

  createFriendRequest(fromUsername: string, toUsername: string): FriendRequest | null {
    if (fromUsername.toLowerCase() === toUsername.toLowerCase()) return null;
    const exists = this.data.friendRequests.find(r => 
      (r.fromUsername.toLowerCase() === fromUsername.toLowerCase() && r.toUsername.toLowerCase() === toUsername.toLowerCase()) ||
      (r.fromUsername.toLowerCase() === toUsername.toLowerCase() && r.toUsername.toLowerCase() === fromUsername.toLowerCase())
    );
    if (exists) return exists;

    const req: FriendRequest = {
      id: randomUUID(),
      fromUsername,
      toUsername,
      status: 'pending'
    };
    this.data.friendRequests.push(req);
    this.persist();
    return req;
  }

  acceptFriendRequest(requestId: string, username: string): boolean {
    const req = this.data.friendRequests.find(r => r.id === requestId);
    if (!req || req.toUsername.toLowerCase() !== username.toLowerCase()) return false;
    
    req.status = 'accepted';
    
    const u1 = this.findUserByName(req.fromUsername);
    const u2 = this.findUserByName(req.toUsername);
    
    if (u1 && u2 && !u1.friends.includes(u2.username)) u1.friends.push(u2.username);
    if (u1 && u2 && !u2.friends.includes(u1.username)) u2.friends.push(u1.username);
    
    this.persist();
    return true;
  }

  removeFriend(u1: string, u2: string) {
    const user1 = this.findUserByName(u1);
    const user2 = this.findUserByName(u2);
    if (user1) user1.friends = user1.friends.filter(f => f.toLowerCase() !== u2.toLowerCase());
    if (user2) user2.friends = user2.friends.filter(f => f.toLowerCase() !== u1.toLowerCase());
    
    this.data.friendRequests = this.data.friendRequests.filter(r => 
      !(r.fromUsername.toLowerCase() === u1.toLowerCase() && r.toUsername.toLowerCase() === u2.toLowerCase()) &&
      !(r.fromUsername.toLowerCase() === u2.toLowerCase() && r.toUsername.toLowerCase() === u1.toLowerCase())
    );
    this.persist();
  }

  // --- channels ------------------------------------------------------------
  listChannelsForUser(userId: string): Channel[] {
    return this.data.channels.filter(c => !c.isPrivate || (c.members && c.members.includes(userId)));
  }

  hasChannel(name: string): boolean {
    return this.data.channels.some((c) => c.name === name);
  }
  
  getChannel(name: string): Channel | undefined {
    return this.data.channels.find((c) => c.name === name);
  }

  createChannel(name: string, topic: string, isPrivate = false, isDm = false, initialMembers: string[] = []): Channel {
    const channel: Channel = { name, topic, isPrivate, isDm, members: isPrivate ? initialMembers : undefined };
    this.data.channels.push(channel);
    this.persist();
    return channel;
  }

  addMemberToChannel(channelName: string, userId: string) {
    const channel = this.getChannel(channelName);
    if (channel && channel.isPrivate) {
      if (!channel.members) channel.members = [];
      if (!channel.members.includes(userId)) {
        channel.members.push(userId);
        this.persist();
      }
    }
  }

  // --- messages ------------------------------------------------------------
  addMessage(message: ChatMessage) {
    this.data.messages.push(message);
    // Trim history for this channel to keep the file small.
    const forChannel = this.data.messages.filter((m) => m.channel === message.channel);
    if (forChannel.length > MAX_MESSAGES_PER_CHANNEL) {
      const excess = forChannel.length - MAX_MESSAGES_PER_CHANNEL;
      const toDrop = new Set(forChannel.slice(0, excess).map((m) => m.id));
      this.data.messages = this.data.messages.filter((m) => !toDrop.has(m.id));
    }
    this.persist();
  }

  editMessage(messageId: string, userId: string, newText: string, newNonce?: string): ChatMessage | undefined {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg || msg.userId !== userId || msg.isDeleted) return undefined;
    
    msg.text = newText;
    msg.nonce = newNonce;
    msg.isEdited = true;
    this.persist();
    return msg;
  }

  deleteMessage(messageId: string, userId: string): ChatMessage | undefined {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg || msg.userId !== userId) return undefined;
    
    msg.text = "[Message deleted]";
    msg.isDeleted = true;
    msg.nonce = undefined; // clear nonce since text is no longer ciphertext
    this.persist();
    return msg;
  }

  toggleReaction(messageId: string, username: string, emoji: string): ChatMessage | undefined {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg || msg.isDeleted) return undefined;

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const idx = msg.reactions[emoji].indexOf(username);
    if (idx !== -1) {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(username);
    }
    this.persist();
    return msg;
  }

  history(channel: string, limit = 50): ChatMessage[] {
    return this.data.messages.filter((m) => m.channel === channel).slice(-limit);
  }
}

export const store = new Store();
export type { UserRecord };
