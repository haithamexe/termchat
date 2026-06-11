// Shared wire protocol between the Ink client and the WebSocket server.
// Every realtime frame is a JSON object with a discriminating `t` field.

export interface PublicUser {
  id: string;
  username: string;
  publicKey: string; // Base64 encoded public key for E2E encryption
}

export interface ChatMessage {
  id: string;
  channel: string;
  userId: string;
  username: string;
  text: string; // This will be the ciphertext, base64 encoded
  nonce?: string; // Base64 encoded nonce, needed for E2E decryption
  ts: number; // epoch millis
  isEdited?: boolean;
  isDeleted?: boolean;
  replyToId?: string; // ID of the message this is replying to
  reactions?: Record<string, string[]>; // emoji -> array of usernames
}

export interface Channel {
  name: string;
  topic: string;
  isPrivate?: boolean;
  members?: string[]; // Array of user IDs if private
  isDm?: boolean;
}

export interface FriendRequest {
  id: string;
  fromUsername: string;
  toUsername: string;
  status: 'pending' | 'accepted';
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------
export type ClientFrame =
  | { t: "hello"; token: string; publicKey?: string } // Optional for backwards compat during migration
  | { t: "join"; channel: string }
  | { t: "history"; channel: string }
  | { t: "msg"; channel: string; text: string; nonce?: string; replyToId?: string }
  | { t: "editMsg"; channel: string; messageId: string; text: string; nonce?: string }
  | { t: "deleteMsg"; channel: string; messageId: string }
  | { t: "react"; channel: string; messageId: string; emoji: string }
  | { t: "read"; channel: string; ts: number }
  | { t: "typing"; channel: string }
  | { t: "createChannel"; name: string; topic?: string; isPrivate?: boolean; isDm?: boolean; initialMembers?: string[] }
  | { t: "inviteToChannel"; channel: string; username: string }
  | { t: "addFriend"; username: string }
  | { t: "acceptFriend"; requestId: string }
  | { t: "removeFriend"; username: string };

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------
export type ServerFrame =
  | { t: "ready"; user: PublicUser; channels: Channel[]; friends: PublicUser[]; friendRequests: FriendRequest[] }
  | { t: "channels"; channels: Channel[] }
  | { t: "history"; channel: string; messages: ChatMessage[] }
  | { t: "msg"; message: ChatMessage }
  | { t: "msgUpdate"; message: ChatMessage } // Used for edits and deletes
  | { t: "receipt"; channel: string; username: string; ts: number }
  | { t: "presence"; online: string[] }
  | { t: "typing"; channel: string; username: string }
  | { t: "system"; channel?: string; text: string }
  | { t: "error"; text: string }
  | { t: "friendUpdate"; friends: PublicUser[]; friendRequests: FriendRequest[] }
  | { t: "userDirectory"; users: PublicUser[] }; // For finding friends/keys

export const DEFAULT_PORT = 8080;
