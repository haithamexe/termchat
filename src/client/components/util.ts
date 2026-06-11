// Small presentational helpers shared across chat components.

const NAME_COLORS = [
  "cyan",
  "green",
  "yellow",
  "magenta",
  "blue",
  "red",
  "cyanBright",
  "greenBright",
  "magentaBright",
];

export function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

export function clock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
