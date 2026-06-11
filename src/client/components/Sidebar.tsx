import React from "react";
import { Box, Text } from "ink";
import type { Channel, ChatMessage } from "../../shared/protocol.js";
import { colorFor } from "./util.js";
import { getTheme } from "../theme.js";

interface Props {
  channels: Channel[];
  active: string;
  online: string[];
  me: string;
  messages: Record<string, ChatMessage[]>;
  lastRead: Record<string, number>;
}

export function Sidebar({ channels, active, online, me, messages, lastRead }: Props) {
  const theme = getTheme();
  
  return (
    <Box flexDirection="column" width={22} marginRight={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.primary}
        paddingX={1}
        flexGrow={1}
      >
        <Text bold color={theme.primary}>
          CHANNELS
        </Text>
        {channels.map((c) => {
          const isActive = c.name === active;
          const channelMessages = messages[c.name] ?? [];
          const lastMsg = channelMessages[channelMessages.length - 1];
          const hasUnread = !isActive && lastMsg && lastMsg.ts > (lastRead[c.name] || 0);

          return (
            <Text 
              key={c.name} 
              color={isActive ? theme.sidebarActiveText : hasUnread ? theme.text : theme.dimText} 
              backgroundColor={isActive ? theme.sidebarActiveBg : undefined}
              bold={hasUnread || isActive}
            >
              {isActive ? "› " : hasUnread ? "• " : "  "}#{c.name}
            </Text>
          );
        })}
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.success}
        paddingX={1}
        marginTop={1}
      >
        <Text bold color={theme.success}>
          ONLINE · {online.length}
        </Text>
        {online.map((name) => (
          <Text key={name} color={colorFor(name)}>
            <Text color={theme.success}>●</Text> {name}
            {name === me ? <Text color={theme.dimText}> (you)</Text> : null}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
