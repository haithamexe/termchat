import React from "react";
import { Box, Text } from "ink";

// Hardcoded ASCII logo — reliable across terminals, no extra deps.
const LOGO = [
  " ████████╗███████╗██████╗ ███╗   ███╗",
  " ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║",
  "    ██║   █████╗  ██████╔╝██╔████╔██║",
  "    ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║",
  "    ██║   ███████╗██║  ██║██║ ╚═╝ ██║",
  "    ╚═╝   ╚══════╝╚═╝     ╚═╝     ╚═╝",
];

// Cyan -> blue -> magenta gradient, one color per line.
const COLORS = ["#22d3ee", "#38bdf8", "#60a5fa", "#818cf8", "#a78bfa", "#c084fc"];

export function Banner() {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      {LOGO.map((line, i) => (
        <Text key={i} color={COLORS[i]} bold>
          {line}
        </Text>
      ))}
      <Text color="gray">— social chat for your terminal —</Text>
    </Box>
  );
}
