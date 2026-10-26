/** Transparent comparison heuristic; not a model tokenizer or billing measurement. */
export function estimateContext(text: string) {
  let ascii = 0;
  let unicode = 0;
  for (const character of text) {
    if (character.codePointAt(0)! <= 0x7f) ascii++;
    else unicode++;
  }
  return {
    method: "utf8-heuristic-v1" as const,
    estimated: true as const,
    utf16Chars: text.length,
    codePoints: ascii + unicode,
    utf8Bytes: Buffer.byteLength(text, "utf8"),
    estimatedTokens: Math.ceil(ascii / 4 + unicode * 1.5),
  };
}

export type ContextEstimate = ReturnType<typeof estimateContext>;
