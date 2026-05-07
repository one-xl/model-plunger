# PROJECT_STATUS

## 当前版本

- `v0.2.0-model-plunger-reposition`

## 本轮完成：项目定位调整为 Model Plunger

已将项目从偏“部署检测 / 文档分析”的表达，增量调整为：

> 模型马桶塞 / Model Plunger  
> AI 编程软件模型接入参数翻译器 + 一键连通性检测器 + 接入知识库  
> Slogan：哪里不通，捅哪里。

核心文案已体现在首页、侧边栏、导航入口、README 和详情页中。

## 已完成改动

- 本轮追加：常见模型平台基础知识库导入
  - 新增 `apps/api/scripts/seed-common-providers.mjs`，可重复执行导入基础 Provider / Model / Doc / CommonError 数据。
  - 新增 `apps/api` 脚本：`npm run db:seed:common`。
  - 已导入 17 个常见平台：OpenAI、Anthropic Claude、Google Gemini、DeepSeek、通义千问 DashScope、Moonshot Kimi、智谱 GLM、OpenRouter、SiliconFlow、火山方舟、百度千帆、Ollama、LM Studio、vLLM、Xinference、LiteLLM、OneAPI / NewAPI。
  - 每个平台都写入了 `rawAnalysisJson.clientConfigGuide`，可在详情页展示“小白填写指南”“一键复制配置”“软件填写指南”。
  - 每个平台写入 400、401、402、404、422 等基础错误说明，用于知识库展示和后续错误分析扩展。
  - 这些数据是起始模板，不包含真实 API Key；部分平台的模型列表、权限、地域和 endpoint 可能随官方变更，需要后续用真实文档抓取和 `/models` 接口持续校准。

- 本轮追加：基于前端实际截图的可用性修正
  - 首页不再只像统计工作台，改成问题导向：先说明“模型马桶塞”解决什么，再展示常见堵点、示例和输出字段。
  - 侧边栏品牌区压缩，减少 logo / 标题 / 长文案拥挤。
  - `/add-doc` 增加“该贴什么文档”的说明，明确不要贴登录后台页；表单增加字段 label 和示例 URL 按钮。
  - `/connect` 增加初始状态下的“快速连通测试”卡片；不再必须先生成配置才看到测试入口。
  - 用 headless Edge 截图复查了首页、解析页、接入页和移动端首页；in-app browser 插件因当前 `node_repl` 只识别 Node 18 而不可用，改用本地 Edge + Playwright 兼容路径验证。

- 本轮追加：错误分析与一键纠错
  - `POST /api/check/test` 的诊断结果新增 `diagnosis.quickFixes`。
  - 覆盖 400、401/403、402、404、422、429、超时、网络错误等常见失败类型。
  - 404 会给出 Base URL 候选修复，例如去掉完整 `/chat/completions`、补 `/v1`、去掉重复 `/v1`、尝试不带 `/v1`。
  - 401/403 会提示 API Key 不对，并提供“去掉 Key 前后空格”的快速修复。
  - 400 / 422 会提示请求格式或参数校验问题，并提供改用 `chat-min` 的快速修复。
  - Gemini 测试失败时会提供恢复 Gemini 默认 REST 根地址的快速修复。
  - 平台详情页和 `/connect` 接入向导已能展示“一键纠错”按钮；点击只修改输入框，不会自动发起请求。
  - 新增 API 回归测试：完整 `/chat/completions` 被当作 Base URL 导致 404 时，应返回 `ENDPOINT_ERROR` 和可应用的 Base URL 修复。

- 后端 `apps/api/src/server.ts`
  - 修改 AI 分析系统 Prompt，定位为“AI 编程软件模型接入参数翻译器”。
  - 在 `analysisSchema` 中新增 `clientConfigGuide`。
  - 保持数据库结构不变，继续使用 `Provider.rawAnalysisJson` 保存完整分析 JSON。
  - 增强 `normalizeBaseUrl` / `buildChatCompletionsUrl` / `buildEndpointUrl` 相关逻辑。
  - 新增 `detectLikelyBaseUrlMistake`，识别完整 endpoint、重复 `/v1`、重复 `/chat/completions`。
  - 修改 404、401/403、model not found、rate limit、quota 等诊断文案，让提示更适合小白。
  - 修正 models 测试在没有显式 models endpoint 时默认拼接 `/v1/models`。

- 后端 `apps/api/src/analysis-repair.ts`
  - 规范化 `clientConfigGuide`，即使 AI 输出缺失也会补齐基础结构。
  - 基于已有 `endpoints`、`compatibility`、首个模型名生成通用 OpenAI Compatible 填写建议。
  - 为 Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio 补齐通用模板。

- 前端 `apps/web/src/main.tsx`
  - 首页改为“模型马桶塞 / Model Plunger”新定位。
  - 首页三个主要入口调整为：解析文档网址、查看接入知识库、一键测试接口。
  - 分析完成后优先展示“小白填写指南”。
  - 新增“一键复制配置”卡片，支持逐项复制、复制 JSON、复制 `.env`。
  - 平台详情页优先展示小白填写指南、一键复制配置、一键测试，再展示原始接口信息、模型列表、JSON 原文。
  - 平台详情页新增“软件填写指南”Tab，覆盖 Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio。
  - 一键测试区域新增 Base URL 填写提醒：通常填到 `/v1`，不要手动加 `/chat/completions`。

- 文档
  - 已更新 `README.md` 为新定位。
  - 已更新 `PROJECT_STATUS.md`。
  - 已更新 `FUTURE_ROADMAP.md`。

## 当前项目结构

- `apps/api`: Fastify + Prisma + SQLite 后端。
- `apps/api/src/server.ts`: API 路由、分析 Prompt、schema、保存、测试诊断逻辑。
- `apps/api/src/analysis-repair.ts`: AI JSON 修复与结构规范化。
- `apps/api/src/integrations.ts`: 静态接入向导模板。
- `apps/api/prisma/schema.prisma`: Provider / Models / Docs / Errors / TestRecord 等模型。
- `apps/web`: Vite + React 前端。
- `apps/web/src/main.tsx`: 当前前端页面、路由、分析结果展示、平台详情和接入向导。

## 数据库说明

本轮没有新增 Prisma 字段。原因：

- `rawAnalysisJson` 已能保存完整 `analysis` JSON。
- 新增的 `clientConfigGuide` 可以通过 `rawAnalysisJson` 保存和读取。
- 为避免破坏已有数据，本轮未新增 `clientProviderType`、`clientBaseUrlToFill` 等冗余字段。

## 软件专用配置完成度

当前 Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio 已有展示入口，但多数仍是 **OpenAI Compatible 通用模板**。

尚未完成每个软件的深度差异化规则，例如：

- Continue `config.json` 自动生成。
- Codex CLI `config.toml` 片段。
- Cline / Kilo Code 的完整 UI 字段映射。
- Chatbox / Cherry Studio 的导入格式。
- Cursor / Trae 的版本差异配置说明。

## 未完成事项

- 未新增数据库迁移。
- 未做独立 `/analysis/:id` 页面。
- 未做端到端浏览器自动化测试。
- 已新增 DeepSeek 等常见平台的基础种子数据；小米 MiMo 尚未加入内置样例。
- 软件专用配置仍以通用模板为主。
- 分析结果手动编辑器还没有针对 `clientConfigGuide` 做细粒度表单编辑，只能通过 JSON 源码整体微调。

## 验证方式

- `npm run build`
- `npm run test`
- 手动验证：
  - `/` 首页显示新定位。
  - `/add-doc` 分析结果包含并展示 `clientConfigGuide`。
  - `/providers/:id` 展示“小白填写指南”“一键复制配置”“软件填写指南”。
  - `/connect` 和详情页测试失败时展示更小白化的诊断文案。
