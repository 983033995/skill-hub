<p align="center"><img src="docs/assets/skill-hub-mark.svg" width="80" alt="Skill Hub" /></p>

<h1 align="center">Skill Hub</h1>
<p align="center"><strong>用一份统一的 Skill 库管理多个 Agent。</strong></p>
<p align="center">盘点本机副本，检查已绑定来源的更新，再通过 MCP 按需读取。</p>

<p align="center">
  <a href="https://github.com/983033995/skill-hub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/983033995/skill-hub/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-blue.svg" /></a>
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-339933" />
  <img alt="Local first" src="https://img.shields.io/badge/Local-first-d7f75b" />
</p>

<p align="center"><a href="README.md">English</a> · <a href="#安装程序">安装</a> · <a href="#让多个-agent-共用一份-hub">接入 Agent</a> · <a href="docs/INDEX.md">完整文档</a> · <a href="CONTRIBUTING.md">参与贡献</a></p>

Skill Hub 是本地运行的 Agent Skill 管理程序。它管理包含 `SKILL.md` 及可选脚本、参考资料或素材的目录，帮助你统一记录来源与版本、盘点各 Agent 路径中的 Skill，并在任务需要时通过 MCP 提供选中的 Skill。

**0.2.2 已发布到 npm。** GitHub Actions OIDC 发布、官方注册库字节完整性和新目录安装均已验收，无需克隆源码或编译。[npm 包说明 →](docs/ops/NPM_PACKAGE_README.md)

## 它解决什么问题

- Skill 随使用不断累积，很难看清装了哪些、分别来自哪里、已绑定来源是否有更新，以及静态检查能发现什么。
- 每个 Agent 都可能留有一份副本，内容和来源记录会逐渐不一致。

Skill Hub 用统一的 canonical 库、来源锁、只读 inventory 和更新检查、有限的静态 audit，以及可选的 MCP 读取来处理这些问题。它首先是 Skill 管理器；按需加载是使用这份库的一种方式。

## 安装程序

npm 包分发的是 Skill Hub 程序，不会替你安装 Skill 内容、导入现有目录或接管宿主设置。需要 **Node.js 20+**；使用 GitHub 来源安装 Skill 时还需要 Git。

```bash
npm install --global @zhangheteng/skill-hub@0.2.2
skill-hub version
# 不全局安装，运行固定版本：
npx --yes @zhangheteng/skill-hub@0.2.2 version
```

如果你已经有 Hub，安装程序不会迁移它，继续使用现有目录即可；不要对现有 Hub 执行 `skill-hub init --force`。只有新建 Hub 时才运行 `skill-hub init`。

## 盘点和管理 Skill

```bash
skill-hub inventory --json
skill-hub check-updates --json
skill-hub audit
```

`inventory` 只读扫描已配置和内置的 Skill 位置，可显示目录状态与来源信息；它不会导入 Skill，也不能证明某个 Agent 正在运行或已连接。要把发现的 Skill 纳入 canonical 库，请通过显式的 install/ingest 流程选择并预览。

`check-updates` 是只读检查，只检查已有 managed source lock 的 Skill。没有绑定来源的 Skill 状态仍是未知；它不会从未登记的目录自动猜测上游或查询所谓“最新版本”。应用更新前先检查计划；本地修改不会被静默替换。见[生命周期管理说明](docs/ops/UNIFIED_SKILL_MANAGEMENT.md)。

`audit` 通过有界静态规则报告可识别的模式，不会执行 Skill 脚本，也不能证明 Skill 安全。请结合源文件和检查结果自行判断。

## 让多个 Agent 共用一份 Hub

在每个支持 MCP 的 Agent 中配置本地 `skill-hub-mcp`，并将它们指向同一个 `SKILL_HUB_HOME`。不同宿主有各自的配置格式；[MCP 接入示例](docs/ops/MCP_INTEGRATION.md)分别列出 Codex TOML 和 OpenCode JSON。MCP 默认提供 11 个工具；可选的 `runtime` 模式只提供三个：`skill_search`、`skill_read` 和 `skill_files`。

```bash
# 固定版本 stdio 服务，可作为 MCP 宿主配置中的 command/args。
npx --yes --package=@zhangheteng/skill-hub@0.2.2 -- skill-hub-mcp
# 等价的 npm exec 写法：
npm exec --yes --package=@zhangheteng/skill-hub@0.2.2 -- skill-hub-mcp
```

连接 MCP 不会删除原生 Skill、编辑 Agent 设置或关闭宿主的原生发现。各宿主需要分别显式配置。需要隔离式 OpenCode 启动时，可选用 `skill-hub-opencode`；它不会替换普通的 `opencode` 命令。见 [OpenCode 接入](docs/ops/OPENCODE_HUB.md)。

## 可选使用记录

使用记录默认关闭。只给想观测的 MCP 进程设置 `SKILL_HUB_USAGE_LOG` 绝对 `.jsonl` 路径。记录反映 Hub 层的搜索/读取请求，不包含客户端身份，也看不到模型是否保留或采用了正文，更不能说明任务是否成功。缺失历史仍为未知；记录不是完整的活动或安全审计。[统计口径与启用方式 →](docs/ops/USAGE_AND_CONTEXT.md)

## 本地工作台

![Skill Hub 技能库，合成演示数据](docs/assets/library.png)

_真实 Web 界面，使用合成演示数据；仓库不包含个人 Skill 库。_

![使用率与上下文预算，合成观测记录](docs/assets/usage-budget.png)

_使用率表示已记录的正文首段读取占比，不是唯一任务数或成功率；Token 为启发式估算，不是模型账单。_

## 能力边界

- Inventory 不会自动导入、复制或同步现有 Skill；托管更新和兼容投影也都需要显式操作。
- 更新检查只覆盖已有 managed source lock。未绑定或未知来源不会自动查最新版本。
- 静态 audit 是有限的启发式检查，不是安全保证。
- npm 分发程序，canonical 库管理 Skill 内容。安装或更新 npm 程序不会删除原生 Skill，也不会禁用 Agent 宿主。
- MCP 当前使用本地 stdio，没有 HTTP MCP 服务。本地只读 Web 界面是独立入口，默认监听 loopback。
- 不承诺普遍的上下文节省、模型费用或任务成功率。使用记录只描述 Hub 请求，不等同于客户端身份或模型实际采用情况。

见[当前能力状态](docs/planning/STATUS.md)、[传输边界](docs/ops/REMOTE_MCP.md)和[来源配置](docs/ops/ENVIRONMENT.md)。

## 参与开发

源码检出和构建面向仓库贡献者。普通用户可直接安装 npm 程序，无需 clone 或编译本仓库。

```bash
git clone https://github.com/983033995/skill-hub.git
cd skill-hub
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm smoke
```

CI 使用合成 fixture 检查 Linux Node 20/22 和 macOS Node 22，不需要模型 Key。真实模型评测是独立、需明确授权且可能计费的操作。[参与贡献](CONTRIBUTING.md) · [报告问题或建议功能](https://github.com/983033995/skill-hub/issues) · [安全报告](SECURITY.md)

仓库自身采用 [MIT](LICENSE)。安装的 Skill 保留各自许可，见 [NOTICE](NOTICE.md)。
