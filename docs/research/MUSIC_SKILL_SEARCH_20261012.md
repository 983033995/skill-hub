# MiniMax网页端音乐Skill检索诊断

状态：Active · 日期：2026-10-12 · 范围：只读诊断与内存对照

## 结论与真实MCP结果

能力已经存在于`multi-provider-image-tts`，但网页端相关词没有写入可检索元数据。BM25只检索名称、description和keywords，无法从正文发现网页端能力，也不能仅凭“Supports multilingual triggers”实现跨语言语义匹配。完整需求能召回正确Skill；缩短查询会使其掉出默认Top-5。

本次7次真实MCP搜索均使用`bm25`，110个候选，无profile/scope过滤，无降级，返回`index_fresh=true`。代表结果：

| 查询 | 网页端能力所在Skill的排名 | 首位 |
|------|---------------------------|------|
| 我想要用网页版minimax music来生成音乐 | 1 | multi-provider-image-tts |
| 我想用网页版 MiniMax Music 生成音乐 | 1 | multi-provider-image-tts |
| 网页版 minimax music | 6（默认Top-5遗漏） | minimax-music-playlist |
| minimax music | 4 | minimax-music-playlist |
| 浏览器生成音乐 | 1 | multi-provider-image-tts |

未取得用户此前宿主的具体工具调用轨迹，不能断言此前使用了哪条查询。

## 能力、描述与检索的差异

- `multi-provider-image-tts`正文声明`generate_music.sh --provider minimax --backend web`；附件存在，统一入口向下游传递backend，底层进入网页端WebSocket音乐生成链路。“网页端”在此指使用网页服务的脚本链路，未证明浏览器界面操作或当前账号生成成功。
- 其description未写“网页版”“网页端”“免 API Key”，catalog无keywords，名称也没有music；网页端生成、历史列表与下载能力藏在正文。
- `minimax-music-gen`和`minimax-music-playlist`正文要求mmx/API凭据，不能因名称包含MiniMax Music就当作网页端入口。
- [BM25实现](../../packages/router/src/bm25.ts)只拼接元数据。[tokenize](../../packages/router/src/tokenize.ts)使用英文token与汉字unigram/bigram，无翻译或语义理解；“网页端”不是backend约束。完整需求的后续候选混入人物视角、视频和运维Skill。
- [索引检查](../../packages/router/src/index-store.ts)以catalogHash为准。本机catalog更新时间为2026-09-25，目标Skill文件已于2026-10-08修改；正文hash与catalog不一致，但当前description与catalog一致。因此存在正文漂移，不能把排名问题归因于旧description；重建旧catalog索引也不会补出缺失的网页端词。
- 名称重复三次意图实现权重，但tokenize全局去重使词频仍为1。内存artifact已验证；这是独立实现缺陷，本轮未修复，也未证明它是本例主要原因。

## 元数据对照实验

使用当前源码构建的Bm25Router与同一110项catalog，在内存中为`multi-provider-image-tts`补入以下顶层keywords，不改变算法或任何文件：

```yaml
keywords:
  - MiniMax Music
  - 网页版音乐生成
  - 网页端音乐生成
  - 免 API Key
  - 歌曲生成
  - 历史音乐下载
  - backend web
```

7条查询×原始/补keywords两种元数据完成对照并通过断言。6条带生成或网页端具体意图的查询，补词后目标均排第1；“网页版 minimax music”从第6升至第1。“minimax music”仍由playlist排第1，目标从第4变第5；不能声称补词解决全部排名问题。本结果仅证明此catalog上的局部改善。

## 建议顺序与验证边界

1. 在Skill真实来源的description说明网页端生成/历史查询下载和登录态要求，补keywords；保留API、mmx、本地引擎区别。使用时明确`--provider minimax --backend web`，避免auto落到本地引擎。
2. 按既有导入流程刷新catalog，再重建索引；真实来源写入先dry-run并备份。本轮未执行个人目录写入。
3. Hub后续分别补正文/附件漂移提示、修复名称权重、建立网页/API/本地与中文/英文意图的排名回归集。语义路由需独立评估；只打开Jev不能让缺失的元数据出现，现有Jev同样只接收候选元数据。

本轮未生成音乐、读取凭据、调用收费模型、修改检索算法或个人Skill；未声明网页端生成回归通过。

## 后续授权修复（2026-10-12）

以上是诊断时的快照。用户随后授权两侧修复，当前状态如下：

- 目标Skill真源补入网页端生成/历史下载的description、9个keywords和后端选择说明；保留原有未提交内容，修改前备份SKILL.md与catalog/index。
- Hub字段权重改为name×3/keywords×3/description×1，多字中文去掉unigram噪音；artifact升级v2，旧版本查询明确降级并要求重建。新增正文hash校验、读取上限、根内链接校验，支持小写skill.md。
- canonical全量重建预览发现ChatCut旧版本坏链；没有删除或换链。改为逐项校验已登记110项的元数据，刷新3项变化，保留缺失项原记录并构建v2索引。当前正确返回`index_fresh=false`及ChatCut缺失原因，不能声称全库健康。
- 本机既有MCP runtime的core/shared/router/server构建文件备份后统一更新；发现旧core不兼容新router时补齐依赖，再对实际部署目录启动新stdio进程，六条网页端查询均首位命中，fetch和脚本目录发现通过。没有重启既有宿主任务；当前对话旧连接仍需重连。
- 37文件156测试、类型检查、构建、lint和隔离smoke通过。200项合成库20次稳态查询含内容hash检查，p95约12.6ms；这只是本机小正文fixture数据，不代表网络盘/大正文库的延迟承诺。
- OpenCode使用现有默认模型的新会话真实通过：先以“网页版 minimax music”搜索，随后fetch/files/read识别统一入口和显式provider/backend。仅调用Hub读取工具，未执行任何音乐脚本；该模型验证使用宿主正常模型服务，未调用Jev。

实际证据保存在本机ignored outputs，公开文档不复制私人Skill正文或凭据。音乐生成未执行，API可用性没有因检索通过而获得验证。
