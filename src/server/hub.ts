// The realtime hub: tracks live sockets, presence, and broadcasts messages.
// For multi-instance scaling you'd publish these events through Redis/NATS
// instead of an in-process Map — the interface would stay the same.

import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { store } from "./db.js";
import { verifyToken } from "./auth.js";
import type {
  ClientFrame,
  ServerFrame,
  PublicUser,
  ChatMessage,
  Channel,
} from "../shared/protocol.js";

interface Client {
  ws: WebSocket;
  user: PublicUser;
}

const CHANNEL_RE = /^[a-z0-9-]{1,24}$/;

class Hub {
  private clients = new Map<WebSocket, Client>();
  // username -> count of open sockets (a user may have several terminals open)
  private presence = new Map<string, number>();

  handleConnection(ws: WebSocket) {
    ws.on("message", (raw) => this.onMessage(ws, raw.toString()));
    ws.on("close", () => this.onClose(ws));
    ws.on("error", () => this.onClose(ws));
  }

  private send(ws: WebSocket, frame: ServerFrame) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
  }

  private sendToUser(username: string, frame: ServerFrame) {
    const payload = JSON.stringify(frame);
    const lower = username.toLowerCase();
    for (const client of this.clients.values()) {
      if (client.user.username.toLowerCase() === lower && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  private broadcast(frame: ServerFrame, filter?: (c: Client) => boolean) {
    const payload = JSON.stringify(frame);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === client.ws.OPEN && (!filter || filter(client))) {
        client.ws.send(payload);
      }
    }
  }

  private onMessage(ws: WebSocket, raw: string) {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw) as ClientFrame;
    } catch {
      this.send(ws, { t: "error", text: "Malformed frame." });
      return;
    }

    // The first frame must authenticate the socket.
    const existing = this.clients.get(ws);
    if (!existing) {
      if (frame.t !== "hello") {
        this.send(ws, { t: "error", text: "Expected hello frame." });
        ws.close();
        return;
      }
      const user = verifyToken(frame.token);
      if (!user) {
        this.send(ws, { t: "error", text: "Invalid or expired token." });
        ws.close();
        return;
      }
      if (frame.publicKey) {
        store.updateUserPublicKey(user.username, frame.publicKey);
        user.publicKey = frame.publicKey;
      } else {
        const u = store.findUserById(user.id);
        if (u && u.publicKey) user.publicKey = u.publicKey;
      }
      this.register(ws, user);
      return;
    }

    this.route(existing, frame);
  }

  private register(ws: WebSocket, user: PublicUser) {
    this.clients.set(ws, { ws, user });
    this.presence.set(user.username, (this.presence.get(user.username) ?? 0) + 1);

    const channels = store.listChannelsForUser(user.id);
    const friends = store.getFriendsFor(user.username);
    const friendRequests = store.getFriendRequestsFor(user.username);
    
    this.send(ws, { t: "ready", user, channels, friends, friendRequests });
    this.send(ws, { t: "userDirectory", users: store.getAllPublicUsers() });
    this.broadcastPresence();

    const firstSocket = this.presence.get(user.username) === 1;
    if (firstSocket) {
      this.broadcast({ t: "system", text: `${user.username} joined the chat.` });
    }
  }

  private onClose(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (!client) return;
    this.clients.delete(ws);

    const { username } = client.user;
    const count = (this.presence.get(username) ?? 1) - 1;
    if (count <= 0) {
      this.presence.delete(username);
      this.broadcast({ t: "system", text: `${username} left the chat.` });
    } else {
      this.presence.set(username, count);
    }
    this.broadcastPresence();
  }

  private broadcastPresence() {
    const online = [...this.presence.keys()].sort();
    this.broadcast({ t: "presence", online });
  }

  private sendChannelsTo(client: Client) {
    this.send(client.ws, { t: "channels", channels: store.listChannelsForUser(client.user.id) });
  }

  private sendFriendUpdateTo(username: string) {
    const friends = store.getFriendsFor(username);
    const friendRequests = store.getFriendRequestsFor(username);
    this.sendToUser(username, { t: "friendUpdate", friends, friendRequests });
  }

  private canAccessChannel(user: PublicUser, channelName: string): boolean {
    const channel = store.getChannel(channelName);
    if (!channel) return false;
    if (!channel.isPrivate) return true;
    return !!channel.members && channel.members.includes(user.id);
  }

  private route(client: Client, frame: ClientFrame) {
    switch (frame.t) {
      case "hello":
        if (frame.publicKey) {
          store.updateUserPublicKey(client.user.username, frame.publicKey);
          client.user.publicKey = frame.publicKey;
          this.broadcast({ t: "userDirectory", users: store.getAllPublicUsers() });
        }
        break;
      case "history": {
        if (!this.canAccessChannel(client.user, frame.channel)) {
          this.send(client.ws, { t: "error", text: "Access denied or unknown channel." });
          return;
        }
        const messages = store.history(frame.channel, 50);
        this.send(client.ws, { t: "history", channel: frame.channel, messages });
        break;
      }
      case "msg": {
        const text = frame.text.trim(); // actually ciphertext now
        if (!text) return;
        if (!this.canAccessChannel(client.user, frame.channel)) {
          this.send(client.ws, { t: "error", text: "Access denied or unknown channel." });
          return;
        }
        const message: ChatMessage = {
          id: randomUUID(),
          channel: frame.channel,
          userId: client.user.id,
          username: client.user.username,
          text: text.slice(0, 4000), // increased length for base64 ciphertext
          nonce: frame.nonce,
          replyToId: frame.replyToId,
          ts: Date.now(),
        };
        store.addMessage(message);
        
        const channel = store.getChannel(frame.channel);
        this.broadcast({ t: "msg", message }, (c) => {
          if (!channel?.isPrivate) return true;
          return !!channel.members && channel.members.includes(c.user.id);
        });
        break;
      }
      case "editMsg": {
        const text = frame.text.trim();
        if (!text) return;
        const updatedMsg = store.editMessage(frame.messageId, client.user.id, text.slice(0, 4000), frame.nonce);
        if (updatedMsg) {
          const channel = store.getChannel(frame.channel);
          this.broadcast({ t: "msgUpdate", message: updatedMsg }, (c) => {
            if (!channel?.isPrivate) return true;
            return !!channel.members && channel.members.includes(c.user.id);
          });
        }
        break;
      }
      case "deleteMsg": {
        const updatedMsg = store.deleteMessage(frame.messageId, client.user.id);
        if (updatedMsg) {
          const channel = store.getChannel(frame.channel);
          this.broadcast({ t: "msgUpdate", message: updatedMsg }, (c) => {
            if (!channel?.isPrivate) return true;
            return !!channel.members && channel.members.includes(c.user.id);
          });
        }
        break;
      }
      case "react": {
        const updatedMsg = store.toggleReaction(frame.messageId, client.user.username, frame.emoji);
        if (updatedMsg) {
          const channel = store.getChannel(frame.channel);
          this.broadcast({ t: "msgUpdate", message: updatedMsg }, (c) => {
            if (!channel?.isPrivate) return true;
            return !!channel.members && channel.members.includes(c.user.id);
          });
        }
        break;
      }
      case "read": {
        if (!this.canAccessChannel(client.user, frame.channel)) return;
        const channel = store.getChannel(frame.channel);
        this.broadcast({
          t: "receipt",
          channel: frame.channel,
          username: client.user.username,
          ts: frame.ts,
        }, (c) => {
           if (!channel?.isPrivate) return true;
           return !!channel.members && channel.members.includes(c.user.id);
        });
        break;
      }
      case "typing": {
        if (!this.canAccessChannel(client.user, frame.channel)) return;
        const channel = store.getChannel(frame.channel);
        this.broadcast({
          t: "typing",
          channel: frame.channel,
          username: client.user.username,
        }, (c) => {
           if (!channel?.isPrivate) return true;
           return !!channel.members && channel.members.includes(c.user.id);
        });
        break;
      }
      case "createChannel": {
        const name = frame.name.trim().toLowerCase();
        if (!CHANNEL_RE.test(name)) {
          this.send(client.ws, {
            t: "error",
            text: "Channel names are 1-24 chars: a-z, 0-9, dash.",
          });
          return;
        }
        if (store.hasChannel(name)) {
          this.send(client.ws, { t: "error", text: "Channel already exists." });
          return;
        }
        const isPrivate = !!frame.isPrivate;
        const isDm = !!frame.isDm;
        const members = isPrivate ? [client.user.id, ...(frame.initialMembers || [])] : [];
        
        const newChannel = store.createChannel(name, frame.topic?.slice(0, 80) ?? "", isPrivate, isDm, members);
        
        if (isPrivate) {
          // Send updated channel list to all members
          for (const memberId of members) {
             const u = store.findUserById(memberId);
             if (u) {
               for (const c of this.clients.values()) {
                 if (c.user.id === u.id) this.sendChannelsTo(c);
               }
             }
          }
          this.send(client.ws, { t: "system", text: `Private channel #${name} created.` });
        } else {
          // Broadcast to everyone
          for (const c of this.clients.values()) this.sendChannelsTo(c);
          this.broadcast({ t: "system", text: `Channel #${name} was created.` });
        }
        break;
      }
      case "inviteToChannel": {
        const channel = store.getChannel(frame.channel);
        if (!channel) {
          this.send(client.ws, { t: "error", text: "Unknown channel." });
          return;
        }
        if (channel.isPrivate) {
          if (!channel.members?.includes(client.user.id)) {
            this.send(client.ws, { t: "error", text: "You are not a member of this private channel." });
            return;
          }
          const target = store.findUserByName(frame.username);
          if (!target) {
            this.send(client.ws, { t: "error", text: `User ${frame.username} not found.` });
            return;
          }
          store.addMemberToChannel(frame.channel, target.id);
          this.sendToUser(target.username, { t: "system", text: `You were invited to #${frame.channel} by ${client.user.username}.` });
          // update channels for target
          for (const c of this.clients.values()) {
            if (c.user.id === target.id) this.sendChannelsTo(c);
            if (c.user.id === client.user.id) this.sendChannelsTo(c); // refresh inviter too just in case
          }
        } else {
           this.send(client.ws, { t: "error", text: "Can only invite to private channels." });
        }
        break;
      }
      case "addFriend": {
        const target = store.findUserByName(frame.username);
        if (!target) {
          this.send(client.ws, { t: "error", text: `User ${frame.username} not found.` });
          return;
        }
        const req = store.createFriendRequest(client.user.username, target.username);
        if (req) {
          this.sendFriendUpdateTo(client.user.username);
          this.sendFriendUpdateTo(target.username);
          this.sendToUser(target.username, { t: "system", text: `${client.user.username} sent you a friend request!` });
          this.send(client.ws, { t: "system", text: `Friend request sent to ${target.username}.` });
        }
        break;
      }
      case "acceptFriend": {
        if (store.acceptFriendRequest(frame.requestId, client.user.username)) {
           // Need to notify both parties
           const req = store.getFriendRequestsFor(client.user.username).find(r => r.id === frame.requestId);
           if (req) {
              this.sendFriendUpdateTo(req.fromUsername);
              this.sendFriendUpdateTo(req.toUsername);
              this.sendToUser(req.fromUsername, { t: "system", text: `${req.toUsername} accepted your friend request.` });
              this.sendToUser(req.toUsername, { t: "system", text: `You are now friends with ${req.fromUsername}.` });
           } else {
               // Should broadcast full update to be safe
               this.sendFriendUpdateTo(client.user.username);
           }
        } else {
           this.send(client.ws, { t: "error", text: "Invalid or unauthorized friend request." });
        }
        break;
      }
      case "removeFriend": {
        store.removeFriend(client.user.username, frame.username);
        this.sendFriendUpdateTo(client.user.username);
        this.sendFriendUpdateTo(frame.username);
        this.send(client.ws, { t: "system", text: `Removed ${frame.username} from friends.` });
        break;
      }
      case "join":
        // In the future this might register presence in a channel, but for now we just verify access
        if (!this.canAccessChannel(client.user, frame.channel)) {
          this.send(client.ws, { t: "error", text: "Access denied to channel." });
        }
        break;
    }
  }
}

export const hub = new Hub();
