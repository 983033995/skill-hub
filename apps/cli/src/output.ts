export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printLines(lines: string[]): void {
  for (const line of lines) console.log(line);
}
