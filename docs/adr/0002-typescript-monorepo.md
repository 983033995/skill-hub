# ADR 0002: TypeScript + pnpm Monorepo 作为实现基线

| 字段 | 值 |
|------|-----|
| 状态 | Accepted |
| 日期 | 2026-08-10 |
| 决策者 | script / agent（基线） |

## 背景

需要 CLI 与 MCP 共置，模块边界清晰，并与 Node 生态（skills CLI、MCP SDK）衔接。

## 决策

- 语言：TypeScript，Node ≥ 20  
- 布局：pnpm workspace（`apps/*` + `packages/*`）  
- Python 仅作为可选绑定/外部引擎适配，不作为 v1 主栈  

## 备选方案

1. 纯 Python 包：利于数据路由原型，MCP/CLI 生态略割裂  
2. Go 单二进制：分发强，迭代与 MCP TS 生态成本高  
3. 多语言无 monorepo：协作与 CI 复杂  

## 后果

### 正面

- 与 MCP/CLI 工具链一致  
- 包边界利于测试  

### 负面

- 需初始化 Node 工具链  
- 重数值检索远期或需 native/别的引擎  

## 后续行动

- Phase 1 落地 package.json / tsconfig / vitest
