export function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function formatWithCommas(value: string): string {
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [intPart, decPart] = abs.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "-" : "") + grouped + (decPart ? "." + decPart : "");
}
