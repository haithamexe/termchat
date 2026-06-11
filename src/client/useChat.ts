// React hook that owns the WebSocket lifecycle and exposes chat state to the UI.

import { useEffect, useRef, useState, useCallback } from "react";
import WebSocket from "ws";
import type {
  ClientFrame,
  ServerFrame,
  ChatMessage,
  Channel,
  PublicUser,
  FriendRequest,
} from "../shared/protocol.js";
import { getOrGenerateKeyPair, encryptMessage, decryptMessage } from "./crypto.js";
import { loadConfig, saveConfig } from "./config.js";

export type Status = "connecting" | "open" | "closed" | "error";

export interface ChatState {
  status: Status;
  user: PublicUser | null;
  channels: Channel[];
  friends: PublicUser[];
  friendRequests: FriendRequest[];
  allUsers: PublicUser[];
  online: string[];
  messages: Record<string, ChatMessage[]>;
  receipts: Record<string, Record<string, number>>; // channel -> username -> ts
  system: string[];
  typing: Record<string, { username: string; at: number }>;
  error: string | null;
  send: (frame: ClientFrame) => void;
  sendEncryptedMessage: (channel: string, text: string, replyToId?: string) => void;
  editEncryptedMessage: (channel: string, messageId: string, text: string) => void;
  deleteMessage: (channel: string, messageId: string) => void;
  reactToMessage: (channel: string, messageId: string, emoji: string) => void;
  markRead: (channel: string, ts: number) => void;
}

export function useChat(token: string, url: string): ChatState {
  const [status, setStatus] = useState<Status>("connecting");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [allUsers, setAllUsers] = useState<PublicUser[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [receipts, setReceipts] = useState<Record<string, Record<string, number>>>({});
  const [system, setSystem] = useState<string[]>([]);
  const [typing, setTyping] = useState<Record<string, { username: string; at: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize keypair
  const keyPairRef = useRef(loadConfig().keyPair || getOrGenerateKeyPair());

  useEffect(() => {
    saveConfig({ keyPair: keyPairRef.current });
  }, []);

  const decryptIncoming = useCallback((m: ChatMessage, currentUsers: PublicUser[], currentChannels: Channel[]) => {
    if (!m.nonce || m.isDeleted) return m; // Not encrypted or deleted

    // Find who sent it to get their public key
    const sender = currentUsers.find(u => u.id === m.userId);
    if (!sender || !sender.publicKey) return { ...m, text: "[Encrypted message - Unknown sender key]" };

    // Attempt decryption
    const decrypted = decryptMessage(m.text, m.nonce, sender.publicKey, keyPairRef.current.secretKey);
    if (decrypted) return { ...m, text: decrypted };

    return { ...m, text: "[Decryption failed]" };
  }, []);

  // Use refs for state needed inside websocket callbacks to avoid closure staleness
  const usersRef = useRef(allUsers);
  const channelsRef = useRef(channels);
  useEffect(() => { usersRef.current = allUsers; }, [allUsers]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.on("open", () => {
      setStatus("open");
      ws.send(JSON.stringify({ t: "hello", token, publicKey: keyPairRef.current.publicKey } satisfies ClientFrame));
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(raw.toString()) as ServerFrame;
      } catch {
        return;
      }
      switch (frame.t) {
        case "ready":
          setUser(frame.user);
          setChannels(frame.channels);
          setFriends(frame.friends);
          setFriendRequests(frame.friendRequests);
          break;
        case "channels":
          setChannels(frame.channels);
          break;
        case "friendUpdate":
          setFriends(frame.friends);
          setFriendRequests(frame.friendRequests);
          break;
        case "userDirectory":
          setAllUsers(frame.users);
          break;
        case "presence":
          setOnline(frame.online);
          break;
        case "history":
          setMessages((m) => {
             const decryptedList = frame.messages.map(msg => decryptIncoming(msg, usersRef.current, channelsRef.current));
             return { ...m, [frame.channel]: decryptedList };
          });
          break;
        case "msg":
          setMessages((m) => {
            const list = m[frame.message.channel] ?? [];
            const decryptedMsg = decryptIncoming(frame.message, usersRef.current, channelsRef.current);
            return { ...m, [frame.message.channel]: [...list, decryptedMsg].slice(-200) };
          });
          break;
        case "msgUpdate":
          setMessages((m) => {
            const list = m[frame.message.channel] ?? [];
            const decryptedMsg = decryptIncoming(frame.message, usersRef.current, channelsRef.current);
            const updatedList = list.map(msg => msg.id === decryptedMsg.id ? decryptedMsg : msg);
            return { ...m, [frame.message.channel]: updatedList };
          });
          break;
        case "receipt":
          setReceipts((r) => {
            const forChannel = r[frame.channel] || {};
            return { ...r, [frame.channel]: { ...forChannel, [frame.username]: Math.max(forChannel[frame.username] || 0, frame.ts) } };
          });
          break;
        case "typing":
          setTyping((t) => ({
            ...t,
            [frame.channel]: { username: frame.username, at: Date.now() },
          }));
          break;
        case "system":
          setSystem((s) => [...s, frame.text].slice(-50));
          break;
        case "error":
          setError(frame.text);
          break;
      }
    });

    ws.on("close", () => setStatus("closed"));
    ws.on("error", () => {
      setStatus("error");
      setError("Connection failed. Is the server running?");
    });

    return () => ws.close();
  }, [token, url, decryptIncoming]);

  const send = useCallback((frame: ClientFrame) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
  }, []);

  const sendEncryptedMessage = useCallback((channelName: string, text: string, replyToId?: string) => {
    const channel = channelsRef.current.find(c => c.name === channelName);

    if (channel?.isDm && channel.members) {
      const otherId = channel.members.find(id => id !== user?.id);
      const otherUser = usersRef.current.find(u => u.id === otherId);

      if (otherUser && otherUser.publicKey) {
        const { ciphertext, nonce } = encryptMessage(text, otherUser.publicKey, keyPairRef.current.secretKey);
        send({ t: "msg", channel: channelName, text: ciphertext, nonce, replyToId });
        return;
      }
    }

    send({ t: "msg", channel: channelName, text, replyToId });
  }, [send, user]);

  const editEncryptedMessage = useCallback((channelName: string, messageId: string, text: string) => {
    const channel = channelsRef.current.find(c => c.name === channelName);

    if (channel?.isDm && channel.members) {
      const otherId = channel.members.find(id => id !== user?.id);
      const otherUser = usersRef.current.find(u => u.id === otherId);

      if (otherUser && otherUser.publicKey) {
        const { ciphertext, nonce } = encryptMessage(text, otherUser.publicKey, keyPairRef.current.secretKey);
        send({ t: "editMsg", channel: channelName, messageId, text: ciphertext, nonce });
        return;
      }
    }

    send({ t: "editMsg", channel: channelName, messageId, text });
  }, [send, user]);

  const deleteMessage = useCallback((channelName: string, messageId: string) => {
    send({ t: "deleteMsg", channel: channelName, messageId });
  }, [send]);

  const reactToMessage = useCallback((channelName: string, messageId: string, emoji: string) => {
    send({ t: "react", channel: channelName, messageId, emoji });
  }, [send]);

  const markRead = useCallback((channelName: string, ts: number) => {
    send({ t: "read", channel: channelName, ts });
  }, [send]);

  return { status, user, channels, friends, friendRequests, allUsers, online, messages, receipts, system, typing, error, send, sendEncryptedMessage, editEncryptedMessage, deleteMessage, reactToMessage, markRead };
}
