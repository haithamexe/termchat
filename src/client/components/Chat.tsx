import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import notifier from "node-notifier";
import { useChat } from "../useChat.js";
import { Sidebar } from "./Sidebar.js";
import { MessageView } from "./MessageView.js";
import type { PublicUser } from "../../shared/protocol.js";
import { getTheme } from "../theme.js";
import { loadConfig, saveConfig } from "../config.js";

interface Props {
  token: string;
  url: string;
  onLogout: () => void;
}

const COMMANDS = ["/new", "/join", "/msg", "/friend", "/invite", "/reply", "/react", "/help", "/logout", "/quit"];

type UIState = "chat" | "menu" | "friends" | "friendRequests";

export function Chat({ token, url, onLogout }: Props) {
  const { exit } = useApp();
  const chat = useChat(token, url);
  const [active, setActive] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [uiState, setUiState] = useState<UIState>("chat");
  const requested = useRef<Set<string>>(new Set());
  const lastTyping = useRef(0);
  const [lastRead, setLastRead] = useState<Record<string, number>>({});
  const processedMessages = useRef<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>(loadConfig().blocked || []);
  const theme = getTheme();

  const me = chat.user?.username ?? "";

  // Tick once a second so the "typing…" indicator can expire on its own.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pick a default channel and lazily fetch history when one is opened.
  useEffect(() => {
    if (!active && chat.channels.length > 0) {
      setActive(chat.channels[0].name);
    }
  }, [chat.channels, active]);

  useEffect(() => {
    if (active) {
      setLastRead((prev) => ({ ...prev, [active]: Date.now() }));
      if (!requested.current.has(active)) {
        requested.current.add(active);
        chat.send({ t: "history", channel: active });
      }
    }
  }, [active, chat, chat.messages]); // Update lastRead when active channel receives messages while active

  // Desktop Notifications Effect
  useEffect(() => {
    if (!me) return;
    for (const [channelName, msgs] of Object.entries(chat.messages)) {
       const channel = chat.channels.find(c => c.name === channelName);
       for (const m of msgs) {
         if (processedMessages.current.has(m.id)) continue;
         processedMessages.current.add(m.id);
         
         if (m.username === me || blocked.includes(m.username.toLowerCase())) continue; // don't notify for our own msgs or blocked users
         
         // Notify if it's a DM, or if we are mentioned, AND we aren't currently reading that channel
         const isMention = m.text.includes(`@${me}`);
         const isDm = channel?.isDm;
         
         if ((isMention || isDm) && active !== channelName && !m.isDeleted) {
            notifier.notify({
              title: `termchat: ${isDm ? 'DM from' : 'Mention by'} ${m.username}`,
              message: m.text,
              sound: true,
            });
         }
       }
    }
  }, [chat.messages, chat.channels, active, me]);

  // Surface server errors as a transient notice.
  useEffect(() => {
    if (chat.error) {
      setNotice(chat.error);
      const timer = setTimeout(() => setNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [chat.error]);

  function cycleChannel(dir: 1 | -1) {
    const names = chat.channels.map((c) => c.name);
    if (names.length === 0) return;
    const idx = Math.max(0, names.indexOf(active));
    const next = (idx + dir + names.length) % names.length;
    setActive(names[next]);
    setEditingId(null);
    setDraft("");
  }

  useInput((input, key) => {
    if (uiState !== "chat") {
      if (key.escape || (key.ctrl && input === "c")) {
        setUiState("chat");
      }
      return; // Let SelectInput handle the rest
    }

    if (key.upArrow && !draft) {
      // Find my last message in this channel
      const msgs = chat.messages[active] || [];
      const myLastMsg = [...msgs].reverse().find(m => m.username === me && !m.isDeleted);
      if (myLastMsg) {
        setDraft(myLastMsg.text);
        setEditingId(myLastMsg.id);
      }
    } else if (key.escape && editingId) {
      setEditingId(null);
      setDraft("");
    } else if (key.tab && !key.shift && draft.startsWith("/")) {
      // Auto-complete command
      const matching = COMMANDS.filter(c => c.startsWith(draft));
      if (matching.length === 1) {
        setDraft(matching[0] + " ");
      }
    } else if (key.tab && !key.shift) cycleChannel(1);
    else if (key.tab && key.shift) cycleChannel(-1);
    else if (key.ctrl && input === "n") setUiState("menu");
    else if (key.ctrl && input === "q") exit();
  });

  function onChange(value: string) {
    setDraft(value);
    const t = Date.now();
    if (value && t - lastTyping.current > 1500) {
      lastTyping.current = t;
      chat.send({ t: "typing", channel: active });
    }
  }

  function onSubmit() {
    const text = draft.trim();
    setDraft("");
    const currentEditId = editingId;
    setEditingId(null);

    if (!text && currentEditId) {
      chat.deleteMessage(active, currentEditId);
      return;
    }
    
    if (!text) return;

    if (text.startsWith("/")) {
      handleCommand(text);
      return;
    }
    
    if (currentEditId) {
      chat.editEncryptedMessage(active, currentEditId, text);
    } else {
      chat.sendEncryptedMessage(active, text);
    }
  }

  function handleCommand(raw: string) {
    const [cmd, ...rest] = raw.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd.toLowerCase()) {
      case "new":
      case "create": {
        const [name, ...topic] = rest;
        if (!name) return setNotice("Usage: /new <name> [topic]");
        chat.send({ t: "createChannel", name, topic: topic.join(" ") });
        setNotice(null);
        break;
      }
      case "join":
      case "go": {
        if (chat.channels.some((c) => c.name === arg)) setActive(arg);
        else setNotice(`No channel #${arg}`);
        break;
      }
      case "msg": {
        const targetUsername = rest[0];
        if (!targetUsername) return setNotice("Usage: /msg <username>");
        const target = chat.allUsers.find(u => u.username === targetUsername);
        if (!target) return setNotice(`User ${targetUsername} not found.`);
        
        // Find existing DM channel or create one
        const dmName = `dm-${[chat.user?.id, target.id].sort().join('-').substring(0, 15)}`;
        if (chat.channels.some(c => c.name === dmName)) {
           setActive(dmName);
        } else {
           chat.send({ t: "createChannel", name: dmName, isPrivate: true, isDm: true, initialMembers: [target.id] });
           // Wait a bit for channel creation then switch
           setTimeout(() => setActive(dmName), 500); 
        }
        break;
      }
      case "friend": {
        const subcmd = rest[0];
        const targetUsername = rest[1];
        if (subcmd === "add" && targetUsername) {
           chat.send({ t: "addFriend", username: targetUsername });
        } else if (subcmd === "remove" && targetUsername) {
           chat.send({ t: "removeFriend", username: targetUsername });
        } else {
           setNotice("Usage: /friend add <username> OR /friend remove <username>");
        }
        break;
      }
      case "invite": {
        const targetUsername = rest[0];
        if (!targetUsername) return setNotice("Usage: /invite <username>");
        chat.send({ t: "inviteToChannel", channel: active, username: targetUsername });
        break;
      }
      case "reply": {
        const targetUsername = rest[0];
        const text = rest.slice(1).join(" ");
        if (!targetUsername || !text) return setNotice("Usage: /reply <username> <text>");
        const msgs = chat.messages[active] || [];
        const lastMsg = [...msgs].reverse().find(m => m.username === targetUsername && !m.isDeleted);
        if (lastMsg) {
          chat.sendEncryptedMessage(active, text, lastMsg.id);
        } else {
          setNotice(`No recent message from ${targetUsername} in this channel.`);
        }
        break;
      }
      case "react": {
        const targetUsername = rest[0];
        const emoji = rest[1];
        if (!targetUsername || !emoji) return setNotice("Usage: /react <username> <emoji>");
        const msgs = chat.messages[active] || [];
        const lastMsg = [...msgs].reverse().find(m => m.username === targetUsername && !m.isDeleted);
        if (lastMsg) {
          chat.reactToMessage(active, lastMsg.id, emoji);
        } else {
          setNotice(`No recent message from ${targetUsername} in this channel.`);
        }
        break;
      }
      case "quit":
      case "exit":
        exit();
        break;
      case "logout":
        onLogout();
        break;
      case "help":
        setNotice("Commands: /new /join /msg /friend /invite /reply /react /block /unblock /logout /quit");
        break;
      default:
        setNotice(`Unknown command: /${cmd}`);
    }
  }

  const activeChannel = useMemo(
    () => chat.channels.find((c) => c.name === active),
    [chat.channels, active]
  );
  const messages = (chat.messages[active] ?? []).filter(m => !blocked.includes(m.username.toLowerCase()));

  const typingEntry = chat.typing[active];
  const typingWho =
    typingEntry && typingEntry.username !== me && now - typingEntry.at < 3000 && !blocked.includes(typingEntry.username.toLowerCase())
      ? typingEntry.username
      : null;

  if (chat.status === "connecting") {
    return <Text color={theme.warning}>Connecting to {url} …</Text>;
  }

  const lastSystem = chat.system[chat.system.length - 1];

  const menuItems = [
    { label: "Return to Chat (Esc)", value: "back" },
    { label: "View Friends", value: "friends" },
    { label: `Friend Requests (${chat.friendRequests.length})`, value: "friendRequests" },
    { label: "Create Private Channel", value: "createPrivate" },
  ];

  const friendItems = chat.friends.length > 0 
    ? [
        { label: "Return to Menu (Esc)", value: "back" },
        ...chat.friends.map(f => ({ label: `DM ${f.username}`, value: `dm_${f.username}` }))
      ]
    : [
        { label: "Return to Menu (Esc)", value: "back" },
        { label: "No friends yet. Add some with /friend add <username>", value: "none" }
      ];
      
  const requestItems = chat.friendRequests.length > 0
    ? [
        { label: "Return to Menu (Esc)", value: "back" },
        ...chat.friendRequests.filter(r => r.toUsername === me && r.status === 'pending').map(r => ({ label: `Accept ${r.fromUsername}`, value: `accept_${r.id}` }))
      ]
    : [
        { label: "Return to Menu (Esc)", value: "back" },
        { label: "No pending requests.", value: "none" }
      ];

  const handleMenuSelect = (item: any) => {
    if (item.value === "back") {
      setUiState(uiState === "menu" ? "chat" : "menu");
      return;
    }
    if (uiState === "menu") {
       if (item.value === "friends") setUiState("friends");
       if (item.value === "friendRequests") setUiState("friendRequests");
       if (item.value === "createPrivate") {
          setNotice("Type: /new <name> and press enter, then /invite <username> to add people.");
          setUiState("chat");
       }
    } else if (uiState === "friends") {
       if (item.value.startsWith("dm_")) {
           const targetUsername = item.value.replace("dm_", "");
           handleCommand(`/msg ${targetUsername}`);
           setUiState("chat");
       }
    } else if (uiState === "friendRequests") {
       if (item.value.startsWith("accept_")) {
           const requestId = item.value.replace("accept_", "");
           chat.send({ t: "acceptFriend", requestId });
           setUiState("menu");
       }
    }
  };

  if (uiState !== "chat") {
    return (
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor={theme.primary}>
         <Box marginBottom={1}>
           <Text bold color={theme.primary}>=== {uiState.toUpperCase()} MENU ===</Text>
         </Box>
         <SelectInput 
            items={uiState === "menu" ? menuItems : uiState === "friends" ? friendItems : requestItems} 
            onSelect={handleMenuSelect} 
         />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={theme.primary}>
          ✦ termchat
        </Text>
        <Text color={theme.dimText}>
          {chat.status === "open" ? (
            <Text color={theme.success}>● connected</Text>
          ) : (
            <Text color={theme.error}>● {chat.status}</Text>
          )}
          {"  "}as <Text color={theme.primary}>{me}</Text>
        </Text>
      </Box>

      {/* Body */}
      <Box>
        <Sidebar 
          channels={chat.channels} 
          active={active} 
          online={chat.online} 
          me={me} 
          messages={chat.messages}
          lastRead={lastRead}
        />
        <MessageView channel={activeChannel} messages={messages} typing={typingWho} me={me} receipts={chat.receipts[active] || {}} />
      </Box>

      {/* Input */}
      <Box borderStyle="round" borderColor={theme.primary} paddingX={1}>
        <Text color={theme.primary}>{`${activeChannel?.isDm ? '@' : '#'}${active} ❯ `}</Text>
        <TextInput
          value={draft}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="type a message, or /help for commands"
        />
      </Box>

      {/* Status line */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={theme.dimText}>
          {notice ? (
            <Text color={theme.warning}>{notice}</Text>
          ) : lastSystem ? (
            <Text color={theme.dimText}>{lastSystem}</Text>
          ) : (
            <Text> </Text>
          )}
        </Text>
        <Text color={theme.dimText}>
          Tab channels/cmd · Ctrl+N menu · /help · Ctrl+Q quit
        </Text>
      </Box>
    </Box>
  );
}
