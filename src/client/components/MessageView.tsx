import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage, Channel } from "../../shared/protocol.js";
import { colorFor, clock } from "./util.js";
import { getTheme } from "../theme.js";

interface Props {
  channel: Channel | undefined;
  messages: ChatMessage[];
  typing: string | null;
  me: string;
  receipts: Record<string, number>;
}

const VISIBLE = 16;

export function MessageView({ channel, messages, typing, me, receipts }: Props) {
  const recent = messages.slice(-VISIBLE);
  const theme = getTheme();

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box
        borderStyle="round"
        borderColor={theme.secondary}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text bold color={theme.secondary}>
          #{channel?.name ?? "—"}
        </Text>
        <Text color={theme.dimText}>{channel?.topic ?? ""}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {recent.length === 0 ? (
          <Text color={theme.dimText} italic>
            No messages yet — be the first to say something.
          </Text>
        ) : (
          recent.map((m) => {
            const isMentioned = me && m.text.includes(`@${me}`);
            const replyMsg = m.replyToId ? messages.find(msg => msg.id === m.replyToId) : null;
            const reactionKeys = m.reactions ? Object.keys(m.reactions) : [];
            const isFromMe = m.username === me;
            const isRead = isFromMe && Object.keys(receipts).some(u => u !== me && receipts[u] >= m.ts);
            
            return (
              <Box key={m.id} flexDirection="column">
                {replyMsg && (
                  <Box marginLeft={2}>
                    <Text color={theme.dimText}>├─› Replying to {replyMsg.username}: {replyMsg.text.substring(0, 30)}{replyMsg.text.length > 30 ? "..." : ""}</Text>
                  </Box>
                )}
                <Box>
                  <Text color={theme.dimText}>{clock(m.ts)} </Text>
                  <Text color={colorFor(m.username)} bold>
                    {m.username}
                  </Text>
                  <Text color={theme.dimText}>: </Text>
                  <Text backgroundColor={isMentioned ? theme.mentionBg : undefined} color={isMentioned ? theme.mentionText : undefined}>
                    {m.text}
                  </Text>
                  {m.isEdited && !m.isDeleted && <Text color={theme.dimText}> (edited)</Text>}
                  {isRead && <Text color={theme.success}> ✓</Text>}
                </Box>
                {reactionKeys.length > 0 && (
                  <Box marginLeft={10}>
                    {reactionKeys.map(emoji => (
                      <Text key={emoji} color={theme.secondary}>
                        [{emoji} {m.reactions![emoji].length}] 
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>

      <Box paddingX={1} height={1}>
        {typing ? (
          <Text color={theme.warning} italic>
            {typing} is typing…
          </Text>
        ) : (
          <Text> </Text>
        )}
      </Box>
    </Box>
  );
}
