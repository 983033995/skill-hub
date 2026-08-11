import { createHash } from "node:crypto";

/** 对内容计算 `sha256:<hex>`。 */
export function sha256Content(content: string | Buffer): string {
  const h = createHash("sha256");
  h.update(content);
  return `sha256:${h.digest("hex")}`;
}
