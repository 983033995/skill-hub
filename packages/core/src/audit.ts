import { open, readdir, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { SkillHubError, isPathInside, resolveAbsolutePath } from "@skill-hub/shared";

export type AuditSeverity = "info" | "warning" | "high" | "critical";

export interface SkillAuditFinding {
  ruleId: string;
  severity: AuditSeverity;
  message: string;
  file: string;
  line: number;
  excerpt: string;
}

export interface SkillAuditSummary {
  critical: number;
  high: number;
  warning: number;
  info: number;
  filesScanned: number;
  bytesScanned: number;
}

export interface SkillAuditResult {
  name: string;
  path: string;
  scannedAt: string;
  passed: boolean;
  complete: boolean;
  findings: SkillAuditFinding[];
  summary: SkillAuditSummary;
}

export interface AuditSkillOptions {
  name?: string;
  maxFileBytes?: number;
  maxDepth?: number;
}

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 16;
const MAX_ENTRIES = 2_000;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FINDINGS = 1_000;

interface Rule {
  id: string;
  severity: AuditSeverity;
  message: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    id: "secret-private-key",
    severity: "critical",
    message: "疑似私钥或证书材料",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
  },
  {
    id: "secret-token",
    severity: "high",
    message: "疑似硬编码 API key、访问令牌或云凭据",
    pattern:
      /(?:AKIA[0-9A-Z]{16}|(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{16,}|(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["'][^"']{12,})/i,
  },
  {
    id: "destructive-shell",
    severity: "high",
    message: "疑似破坏性系统或仓库操作",
    pattern:
      /(?:\brm\s+-[rf]{1,2}\b|\bsudo\b|\bmkfs(?:\.|\s)|\bdd\s+if=|git\s+reset\s+--hard|chmod\s+777)/i,
  },
  {
    id: "remote-shell-pipe",
    severity: "critical",
    message: "远程内容直接管道执行 shell",
    pattern: /(?:curl|wget)\b[^\n|]*\|\s*(?:ba|z)?sh\b/i,
  },
  {
    id: "network-request",
    severity: "warning",
    message: "包含网络请求或外部内容获取代码，需人工确认目标和数据范围",
    pattern:
      /(?:\bcurl\b|\bwget\b|fetch\s*\(|(?:requests|httpx|axios)\.(?:get|post|put|patch|delete)\s*\(|Invoke-WebRequest)/i,
  },
  {
    id: "dynamic-execution",
    severity: "high",
    message: "包含动态执行或子进程调用",
    pattern:
      /(?:\beval\s*\(|\bexec\s*\(|child_process|subprocess\.(?:run|Popen|call)|os\.system\s*\()/i,
  },
  {
    id: "encoded-payload",
    severity: "warning",
    message: "包含编码/解码后执行或隐藏载荷的常见模式",
    pattern: /(?:base64\s+(?:-d|--decode)|atob\s*\(|fromCharCode\s*\(|xxd\s+-r)/i,
  },
  {
    id: "prompt-injection",
    severity: "warning",
    message: "疑似要求忽略上层指令、泄露秘密或绕过安全边界",
    pattern:
      /(?:ignore\s+(?:all\s+)?(?:previous|prior|system|developer)(?:\s+system)?\s+instructions?|reveal\s+(?:the\s+)?(?:system|developer)\s+prompt|禁用安全|忽略(?:之前|上层|系统|开发者)指令|泄露(?:密钥|提示词|秘密))/i,
  },
];

export async function auditSkillTree(
  root: string,
  options: AuditSkillOptions = {},
): Promise<SkillAuditResult> {
  const rootPath = resolveAbsolutePath(root);
  const rootReal = await realpath(rootPath).catch((cause) => {
    throw new SkillHubError({
      code: "E_PATH",
      message: `无法解析 Skill 根目录: ${rootPath}`,
      cause,
    });
  });
  const rootStat = await stat(rootReal).catch((cause) => {
    throw new SkillHubError({
      code: "E_PATH",
      message: `无法读取 Skill 根目录: ${rootPath}`,
      cause,
    });
  });
  if (!rootStat.isDirectory()) {
    throw new SkillHubError({ code: "E_PATH", message: `Skill 根不是目录: ${rootPath}` });
  }

  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 20 * 1024 * 1024) {
    throw new SkillHubError({ code: "E_CONFIG", message: "audit maxFileBytes 超出允许范围" });
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 64) {
    throw new SkillHubError({ code: "E_CONFIG", message: "audit maxDepth 超出允许范围" });
  }

  const findings: SkillAuditFinding[] = [];
  const summary: SkillAuditSummary = {
    critical: 0,
    high: 0,
    warning: 0,
    info: 0,
    filesScanned: 0,
    bytesScanned: 0,
  };
  const visited = new Set<string>();
  let complete = true;
  let entryCount = 0;

  const addFinding = (finding: SkillAuditFinding) => {
    // Findings never expose source lines, including credentials matched by other rules.
    finding.excerpt = "[内容省略]";
    if (findings.length >= MAX_FINDINGS) {
      complete = false;
      return;
    }
    findings.push(finding);
    summary[finding.severity] += 1;
  };

  async function walk(current: string, relative: string, depth: number): Promise<void> {
    if (
      ++entryCount > MAX_ENTRIES ||
      summary.bytesScanned >= MAX_TOTAL_BYTES ||
      findings.length >= MAX_FINDINGS
    ) {
      complete = false;
      return;
    }
    if (depth > maxDepth) {
      complete = false;
      addFinding({
        ruleId: "scan-depth",
        severity: "warning",
        message: "超过审计目录深度上限，未继续扫描",
        file: relative || ".",
        line: 1,
        excerpt: relative || ".",
      });
      return;
    }
    const resolved = await realpath(current).catch((cause) => {
      throw new SkillHubError({ code: "E_PATH", message: `无法解析审计路径: ${current}`, cause });
    });
    if (!isPathInside(resolved, rootReal)) {
      throw new SkillHubError({ code: "E_PATH", message: `Skill 内部链接越界: ${current}` });
    }
    const info = await stat(resolved);
    if (info.isDirectory()) {
      if (visited.has(resolved)) {
        complete = false;
        addFinding({
          ruleId: "scan-cycle",
          severity: "high",
          message: "检测到目录链接环路，已停止该分支",
          file: relative || ".",
          line: 1,
          excerpt: relative || ".",
        });
        return;
      }
      visited.add(resolved);
      for (const entry of (await readdir(resolved, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (entry.name === ".git") continue;
        if (entry.name === "node_modules") {
          complete = false;
          addFinding({
            ruleId: "dependency-directory",
            severity: "warning",
            message: "依赖目录未扫描，审计不完整",
            file: relative ? `${relative}/node_modules` : "node_modules",
            line: 1,
            excerpt: "",
          });
          continue;
        }
        const child = path.join(resolved, entry.name);
        await walk(child, relative ? path.posix.join(relative, entry.name) : entry.name, depth + 1);
      }
      visited.delete(resolved);
      return;
    }
    if (!info.isFile()) {
      complete = false;
      addFinding({
        ruleId: "special-file",
        severity: "warning",
        message: "特殊文件未读取，审计不完整",
        file: relative,
        line: 1,
        excerpt: "",
      });
      return;
    }
    const file = relative || path.basename(resolved);
    if (info.size > maxFileBytes || info.size > MAX_TOTAL_BYTES - summary.bytesScanned) {
      complete = false;
      addFinding({
        ruleId: "file-too-large",
        severity: "warning",
        message: `文本文件超过 ${maxFileBytes} 字节审计上限，已跳过内容扫描`,
        file,
        line: 1,
        excerpt: `${info.size} bytes`,
      });
      return;
    }
    const handle = await open(
      resolved,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let bytes: Buffer;
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== info.size)
        throw new SkillHubError({ code: "E_PATH", message: "审计文件在读取前发生变化" });
      const buffer = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await handle.read(buffer, length, buffer.length - length, null);
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      const after = await handle.stat();
      if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
        throw new SkillHubError({ code: "E_PATH", message: "审计期间文件发生变化，请重试" });
      bytes = buffer.subarray(0, length);
    } finally {
      await handle.close();
    }
    summary.bytesScanned += bytes.length;
    if (bytes.includes(0)) return;
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      complete = false;
      addFinding({
        ruleId: "unsupported-encoding",
        severity: "warning",
        message: "非UTF-8文件未做文本规则扫描",
        file,
        line: 1,
        excerpt: "",
      });
      return;
    }
    summary.filesScanned += 1;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const excerpt = line.trim().slice(0, 240);
      for (const rule of RULES) {
        if (!rule.pattern.test(line)) continue;
        rule.pattern.lastIndex = 0;
        addFinding({
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          file,
          line: index + 1,
          excerpt,
        });
      }
    }
    if ((info.mode & 0o111) !== 0) {
      addFinding({
        ruleId: "executable-file",
        severity: "info",
        message: "文件带有执行权限；Skill 不会由 audit 自动执行",
        file,
        line: 1,
        excerpt: `mode=${(info.mode & 0o777).toString(8)}`,
      });
    }
  }

  await walk(rootReal, "", 0);
  findings.sort(
    (a, b) =>
      a.severity.localeCompare(b.severity) || a.file.localeCompare(b.file) || a.line - b.line,
  );
  const name = options.name?.trim() || path.basename(rootPath);
  return {
    name,
    path: rootPath,
    scannedAt: new Date().toISOString(),
    passed: complete && summary.critical === 0 && summary.high === 0,
    complete,
    findings,
    summary,
  };
}
