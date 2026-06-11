import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Banner } from "./Banner.js";
import { register as apiRegister, login as apiLogin, type AuthResult } from "../api.js";

interface Props {
  server: string;
  onAuthed: (result: AuthResult) => void;
}

type Mode = "login" | "register";
type Field = "username" | "password";

export function Login({ server, onAuthed }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [field, setField] = useState<Field>("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (busy) return;
    if (key.tab) {
      setMode((m) => (m === "login" ? "register" : "login"));
      setError(null);
    }
    if (key.upArrow) setField("username");
    if (key.downArrow) setField("password");
  });

  async function submit() {
    if (busy) return;
    if (!username || !password) {
      setError("Enter a username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fn = mode === "register" ? apiRegister : apiLogin;
      const result = await fn(server, username.trim(), password);
      onAuthed(result);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Banner />

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        width={52}
        alignSelf="center"
      >
        <Box marginBottom={1} justifyContent="center">
          <Text bold color={mode === "login" ? "cyan" : "gray"}>
            {mode === "login" ? "▸ Sign in" : "  Sign in"}
          </Text>
          <Text color="gray">{"   "}</Text>
          <Text bold color={mode === "register" ? "magenta" : "gray"}>
            {mode === "register" ? "▸ Register" : "  Register"}
          </Text>
        </Box>

        <Box>
          <Text color={field === "username" ? "cyan" : "gray"}>
            {field === "username" ? "❯ " : "  "}user  </Text>
          <TextInput
            value={username}
            onChange={setUsername}
            focus={field === "username" && !busy}
            onSubmit={() => setField("password")}
            placeholder="your handle"
          />
        </Box>

        <Box>
          <Text color={field === "password" ? "cyan" : "gray"}>
            {field === "password" ? "❯ " : "  "}pass  </Text>
          <TextInput
            value={password}
            onChange={setPassword}
            focus={field === "password" && !busy}
            onSubmit={submit}
            mask="•"
            placeholder="secret"
          />
        </Box>
      </Box>

      <Box flexDirection="column" alignItems="center" marginTop={1}>
        {busy && <Text color="yellow">Authenticating…</Text>}
        {error && <Text color="red">✖ {error}</Text>}
        <Text color="gray">
          ↑/↓ switch field · Enter submit · Tab toggles login/register
        </Text>
        <Text color="gray" dimColor>
          server: {server}
        </Text>
      </Box>
    </Box>
  );
}
