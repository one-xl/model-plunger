# 模型马桶塞 / Model Plunger

哪里不通，捅哪里。

Model Plunger 是一个面向小白的 **AI 编程软件模型接入参数翻译器 + 一键连通性检测器 + 接入知识库**。

它把复杂的大模型 API 文档，翻译成 Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio 等 AI 编程软件里能直接复制填写的 Base URL、API Key、模型名和协议配置，并支持一键测试是否接通。

## 它解决什么问题

很多模型平台文档会写一堆 API 路径、curl 示例和鉴权方式，但普通用户真正想知道的是：

- Provider 类型应该选什么？
- Base URL 应该填什么？
- API Key 填在哪？
- Model Name 应该怎么写？
- `/v1` 要不要填？
- `/chat/completions` 要不要填？
- 软件会不会自动拼接 endpoint？
- 404 是不是 URL 写堵了？
- 401 / 403 是不是 Key 不对？
- Cursor、Trae、Cline、Continue 里分别怎么填？

Model Plunger 的目标就是把“读文档”翻译成“填软件配置项”。

## 小米 MiMo 这类典型例子

有些平台文档会给出类似：

```text
Base URL: https://token-plan-cn.xiaomimimo.com/v1
Chat Completions: /chat/completions
```

实际完整接口 URL 是：

```text
https://token-plan-cn.xiaomimimo.com/v1/chat/completions
```

但大多数 OpenAI Compatible 的 AI 编程软件通常只需要用户填写：

```text
Provider: OpenAI Compatible
Base URL: https://token-plan-cn.xiaomimimo.com/v1
API Key: YOUR_API_KEY
Model: 按文档填写模型名
```

不要把 `/chat/completions` 手动填进 Base URL，否则软件再次拼接后就可能 404。Model Plunger 会把这些判断整理成“小白填写指南”和“一键复制配置”。

## MVP 功能

- 在线文档 URL 抓取，支持单页、同站递归、Sitemap、GitHub README、OpenAPI / Swagger JSON。
- AI 分析大模型接入文档，输出结构化 JSON。
- 新增 `clientConfigGuide`，优先生成面向软件填写的配置指南。
- 小白填写指南：Provider、Base URL、API Key、模型名、完整 Chat URL、`/v1` 和 `/chat/completions` 填写建议。
- 一键复制配置：逐项复制、复制 JSON、复制 `.env`。
- 软件填写指南：Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio。
- 保存到 SQLite 接入知识库。
- 平台详情页查看指南、原始接口、模型列表、JSON 原文。
- 一键连通测试，使用最小 prompt 和低 token 输出。
- 小白化错误诊断：Key 不对、URL 填堵了、模型名填错、额度不足、请求太快。
- 知识库导入 / 导出。

## 使用流程

1. 打开 `/add-doc`，粘贴模型平台在线文档 URL。
2. 点击“抓取文档”。
3. 点击“AI 分析文档并提取接入步骤”。
4. 先看“小白填写指南”和“一键复制配置”。
5. 保存到知识库。
6. 在详情页或 `/connect` 里填写 API Key，执行低成本连通测试。
7. 如果失败，按诊断提示检查 `/v1`、`/chat/completions`、API Key 和模型名。

## 本地启动

```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:8080

## 导入基础知识库

项目内置了一份常见模型平台起始数据，可重复导入到本地 SQLite：

```bash
cd apps/api
npm run db:seed:common
```

当前包含 OpenAI、Anthropic Claude、Google Gemini、DeepSeek、通义千问 DashScope、Moonshot Kimi、智谱 GLM、OpenRouter、SiliconFlow、火山方舟、百度千帆、Ollama、LM Studio、vLLM、Xinference、LiteLLM、OneAPI / NewAPI。  
这些数据是基础模板，模型名、额度和平台路径可能变化，正式使用前仍建议结合官方文档和 `/models` 接口复核。

## 环境变量

复制 `.env.example` 为 `.env`，按需填写：

```env
PORT=8080
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=file:./dev.db
ANALYZER_BASE_URL=https://api.openai.com/v1
ANALYZER_API_KEY=sk-xxxx
ANALYZER_MODEL=gpt-4o-mini
```

`ANALYZER_*` 用于分析文档，要求是 OpenAI Compatible Chat Completions 接口。

## 安全说明

- 抓取 URL 仅允许公开 `http/https`。
- 禁止 `localhost`、回环地址、内网 IP 和 `file://`。
- 抓取内容限制 5MB。
- 不在日志里输出完整 API Key。
- 测试记录不保存 API Key。
- 连通测试会调用真实模型接口，可能消耗 token 或产生费用，默认建议使用低成本测试。

## 未来计划

- 完善小白填写指南和 Base URL 自动修复建议。
- 增加更多真实平台样例：小米 MiMo、DeepSeek、通义千问、Kimi、智谱 GLM、OpenRouter、SiliconFlow、Ollama、LM Studio 等。
- 增加分析结果手动编辑器。
- 做 Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio 的专用配置模板。
- 支持导出 Continue `config.json`、Codex `config.toml`、OpenAI Compatible `.env` 等配置文件。
