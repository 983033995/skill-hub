# ADR 0013: 个人可信客户端的 Streamable HTTP 托管

| 字段 | 值 |
|------|-----|
| 状态 | Superseded（2026-10-29撤回） |
| 日期 | 2026-10-26 |
| 决策者 | Owner请求；Codex实施 |

## 2026-10-29 撤回

用户要求移除 HTTP 托管。当前源码与后续候选移除 HTTP MCP 入口、远端 exposure、环境配置及 npm HTTP 命令；stdio/full/runtime 和本地 Web REST 保留。已发布 v0.2.1 的历史包不变，本次不发布新版本。下文为原决策和历史实现边界，不是当前启动指南。

## 背景

Owner要求实现可流式HTTP托管。已有stdio工具与本地Web REST不能提供远端MCP URL；本轮未指定托管账号、目标机器或允许上传的Skill范围。

## 决策

- 保留stdio入口和full/runtime行为；抽出共享`server.ts`，HTTP入口独立，不在库导入时启动stdio。
- 使用现有锁定SDK的`StreamableHTTPServerTransport`，每次POST新建Server/transport，`sessionIdGenerator: undefined`。POST响应使用SSE；不维护会话、不提供独立GET事件流或DELETE会话终止，返回405。
- HTTP固定runtime三工具，剥除读取结果中的服务端绝对路径，搜索警告和失败只返回通用诊断。Skill正文与描述属于授权内容，不改写其中的路径/秘密。
- 每次请求校验静态Bearer token、精确Host和可选Origin，默认loopback；非loopback需显式Host名单。不信任Forwarded头。1MiB请求上限、16个同时处理的POST、30秒响应期限、关闭时最多5秒排空。
- `/healthz`同样鉴权，仅反映进程存活，不证明catalog、索引或端到端就绪。网络限流、HTTPS与持久化由托管方提供；关闭HTTP连接不保证底层文件或外部API任务立即取消。
- 这是单租户、共享授权范围的个人服务；静态token不是OAuth。OAuth发现/issuer/audience、按用户数据隔离、目录平台上架、npm发行为独立工作。本轮不部署公共服务、不上传个人Skill或改宿主配置。

## 备选方案

1. 改造Web REST为MCP：混合两个边界且容易暴露未鉴权Web，拒绝。
2. stateful MCP：当前只读工具无需会话，暂不引入会话清理和路由。
3. 一次实现OAuth/多租户：缺少目标客户端和授权服务器，超出当前范围。

## 后果

支持自带Authorization头的HTTP客户端可连接同一服务；stdio保持兼容。需要OAuth的宿主、依赖GET事件流或旧HTTP+SSE的客户端不保证可用。显式usage日志和可选Jev仍按服务端配置工作。源码接口属于下次MINOR发行范围，本轮不改变既有发行号或执行发布。

部署与验收见[REMOTE_MCP](../ops/REMOTE_MCP.md)。
