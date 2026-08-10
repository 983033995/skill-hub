# ADR 0003: 可插拔路由引擎（默认 BM25）

| 字段 | 值 |
|------|-----|
| 状态 | Accepted |
| 日期 | 2026-08-10 |
| 决策者 | script / agent（基线） |

## 背景

社区已有 ASF、neuro-skill、GoS 等路由方案。v1 需离线、零强制外部依赖，又要保留接入增强的空间。

## 决策

1. 定义 `RouterEngine` 接口  
2. 内建默认实现：`bm25`  
3. 通过配置 `router.engine` 支持 `hybrid` / `external-asf` / `external-neuro` 等  
4. 外部引擎失败时降级到内建，并显式告警  

## 备选方案

1. 只捆绑 ASF：集成快，但版本与 hook 行为受制于外部  
2. 只上 embedding：成本与离线冲突  
3. 无接口直接写死：后续替换成本高  

## 后果

### 正面

- 本地可启动  
- 可演进  

### 负面

- 接口稳定性要管理  
- 早期 BM25 命中可能需 description 治理  

## 后续行动

- P1 实现 BM25  
- P3 适配 external engine
