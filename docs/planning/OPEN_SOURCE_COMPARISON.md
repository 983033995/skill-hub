# 开源方案对比与 skill-hub 接管决策

核对日期：2026-09-05。来源为下列仓库当日默认分支 README；功能为项目自述，未安装运行这些竞品，也未以星数推断质量。

| 项目 | 许可证（README） | 实际定位及已声明能力 | 对 skill-hub 的启发 |
|---|---|---|---|
| [vercel-labs/skills](https://github.com/vercel-labs/skills/blob/main/README.md) | MIT | 多 Agent 安装器；本地/Git 来源、选择 skill/Agent、canonical + symlink 或 copy、list/update/remove；`use` 可暂存技能并启动支持的 Agent | 补直接安装和更新入口；保留完整资源目录；安装来源可追踪；不要依赖先安装到某个 Agent |
| [numman-ali/openskills](https://github.com/numman-ali/openskills/blob/main/README.md) | Apache-2.0 | 通用 loader；GitHub/本地/私有 Git 安装；read 按需读取；sync 生成 AGENTS.md 中的 available_skills；更新已记录来源的 skill | 管理与读取分离；来源缺失时明确需要绑定；读取正文应保留资源基准路径 |
| [runkids/skillshare](https://github.com/runkids/skillshare/blob/main/README.md) | MIT | 最贴近统一管理：独立 source 目录、跨 Agent sync、copy fallback、install/update、目标过滤、项目模式、UI、审计、Git 同步；另扩展到 agents/rules/commands | 保留本项目 canonical 架构，补齐安装生命周期、目标存在状态与全目录差异；不在本轮扩展到规则、Agent 定义或团队平台 |

对比限定：README 不足以证明事务恢复、并发安全、更新本地修改保护或锁文件的具体实现，本报告不把这些视为已验证的竞品保证。没有复制竞品源码，也没有新增竞品运行时依赖。

## 决策

沿用现有 TypeScript monorepo。core 管来源和文件，router 管检索，sync 管投影，CLI 装配；目前无需整仓重构。新增 managed 生命周期和只读 takeover 预览；修复原有 ingest 的增量丢 catalog 与附件漏检，比替换技术栈更直接地解决本机问题。

独立 Skill 的入口收口为 Hub：本地目录或 GitHub → `install/adopt/update` → canonical + 来源锁 → catalog/index → `sync` → Agent symlink/copy。各 Agent 保留它们认识的发现目录，但用户不再分别维护安装副本。

插件自带 Skill 作为 external 只读盘点。插件的 MCP、授权、工具、运行时与自更新仍属于插件管理器，复制 SKILL.md 无法替代它们。本轮不接管插件缓存，不卸载插件，也不宣称“所有插件从此不需要安装”。

统一安装不自动等于节省上下文：原生扫描全部 symlink 的 Agent 仍可能注入全部描述。按需读取依赖宿主实际支持且使用已有 MCP search/fetch；本轮不宣称已经调整宿主提示词或 Trust 配置。

## 本轮验收范围

- 独立本地/GitHub Skill 直接进入 Hub；来源及完整目录版本可追踪，更新保护本地改动。
- dry-run 不写 Skill、catalog、历史或 Agent 路径；显式 Git 来源的预览允许临时下载并清理。
- 增量导入保留原 catalog；完整目录冲突显式报告；替换前保留原件。
- copy 投影与校验覆盖脚本、附件；预览后出现的新目标不被覆盖；替换失败可恢复。
- 本机只读报告包含插件边界、坏链、递归链接和不同版本；迁移不以名称排序自动选胜者。

GUI、任意 Git 服务、团队共享、系统插件接管、自动后台更新和生产迁移不算已经完成。
