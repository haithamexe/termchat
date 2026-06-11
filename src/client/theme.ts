import { loadConfig } from "./config.js";

export interface Theme {
  primary: string;
  secondary: string;
  success: string;
  error: string;
  warning: string;
  text: string;
  dimText: string;
  background?: string;
  mentionBg: string;
  mentionText: string;
  sidebarActiveBg: string;
  sidebarActiveText: string;
}

export const defaultTheme: Theme = {
  primary: "cyan",
  secondary: "blue",
  success: "green",
  error: "red",
  warning: "yellow",
  text: "white",
  dimText: "gray",
  mentionBg: "yellow",
  mentionText: "black",
  sidebarActiveBg: "cyan",
  sidebarActiveText: "black",
};

let cachedTheme: Theme | null = null;

export function getTheme(): Theme {
  if (cachedTheme) return cachedTheme;
  const configTheme = loadConfig().theme;
  cachedTheme = { ...defaultTheme, ...configTheme };
  return cachedTheme;
}
