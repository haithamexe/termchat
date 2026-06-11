#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./components/App.js";

// Ink needs a real TTY to render the full-screen UI.
if (!process.stdout.isTTY) {
  console.error("termchat must be run in an interactive terminal.");
  process.exit(1);
}

const app = render(<App />);
app.waitUntilExit().then(() => process.exit(0));
