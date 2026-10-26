# ADR 0014: 独立的单包 npm 发行候选

| 字段 | 值 |
|------|-----|
| 状态 | Accepted |
| 日期 | 2026-10-26 |
| 决策者 | Owner要求推进npm安装/发行准备；Codex实施 |

## 背景

源码workspace全部private且使用workspace依赖，不能直接作为已可安装的公共npm包。Owner在HTTP实现后要求继续推进npm分发。

## 决策

- 源码root/workspace保持`private: true`；用`pnpm pack:npm`从构建结果生成独立`skill-hub`命令包候选，不执行publish。root/各包/协议版本统一为0.2.0，未发布状态保持明确。
- 单包包含CLI、stdio MCP、HTTP MCP、Web入口、当前生产源码对应的编译JS、Web静态文件、五个显式配置模板与本仓库许可。无安装生命周期脚本，不带个人Skill、catalog、日志、node_modules、测试、源码或source map。
- 打包使用既有TypeScript AST只转换模块specifier：`@skill-hub/*`映射为包内`#skill-hub/*`，由Node imports指向自带模块。未知workspace或未声明外部依赖失败。外部MCP SDK维持原锁定直接依赖版本；不发布七个内部包，不增加bundler依赖。
- 输出在忽略的`outputs/npm-*`，每次独立目录保留tarball、内容报告、integrity与验收报告。可用`--name`指定经确认的包名；注册库404不是包名注册保证。
- `pnpm check:npm`真实安装tarball到独立prefix，从空cwd验收CLI/npm exec、配置模板、profile、stdio分页/hash、鉴权HTTP软链接入口和Web静态资源；不操作个人Hub，不调用模型。
- 现有CI追加包安装门禁。它需要公共npm依赖下载，无模型密钥；外部依赖仍由npm解析自身传递范围。npm身份、包名权限、最终文件及发布回执在真正publish前核对。

## 备选方案

1. 分别公开全部workspace：增加包名权限与发布顺序，当前不需要。
2. 引入bundler：可能影响import.meta.url附近的模板/静态资源定位，当前保留既有目录更简单。
3. 直接发布根目录：容易携带内部依赖或无关文件，保留private防护。

## 后果

提供的是命令发行包，不承诺稳定的JavaScript库exports。npm包不会托管HTTP服务；公网部署、OAuth与多租户仍单独验收。实际发布需要有效npm身份，包候选/本地安装/CI与注册库发布分别记录。回退源码改动或旧tarball不影响个人Skill库。

操作说明见[NPM_DISTRIBUTION](../ops/NPM_DISTRIBUTION.md)。
