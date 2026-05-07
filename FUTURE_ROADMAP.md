# FUTURE_ROADMAP

## 产品方向

模型马桶塞 / Model Plunger 的长期目标是成为一个面向小白的：

> AI 编程软件模型接入参数翻译器 + 一键连通性检测器 + 接入知识库

重点不再是复杂的 DevOps 部署检测，而是帮助用户把陌生模型平台文档翻译成 Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio 等软件能直接填写的配置项。

## P0：当前 MVP 稳定与小白指南

- 完善小白填写指南。
- 增加更多真实平台测试样例。
- 增强 Base URL 自动修复建议。
- 增加分析结果手动编辑器。
- 增强 `clientConfigGuide` 的前端表单编辑能力。
- 为 404、401/403、model not found 建立更多回归测试。

## P1：软件专用配置模板

- 做 Cursor 专用配置模板。
- 做 Trae 专用配置模板。
- 做 Cline 专用配置模板。
- 做 Continue `config.json` 自动生成。
- 做 Kilo Code 配置模板。
- 做 Codex CLI provider 配置模板。
- 做 Chatbox / Cherry Studio 配置模板。

## P2：配置导出与分享

- 支持导出不同软件的配置文件。
- 支持直接生成 Continue `config.json`。
- 支持生成 Cline 配置说明。
- 支持生成 Codex `config.toml` 片段。
- 支持生成 OpenAI Compatible 通用 `.env`。
- 支持模型平台配置分享。
- 支持把测试成功的配置保存为可复用模板。

## P3：主流平台收录

- 小米 MiMo
- DeepSeek
- 通义千问
- Kimi
- 智谱 GLM
- 火山方舟
- 百度千帆
- OpenRouter
- SiliconFlow
- Ollama
- LM Studio
- vLLM
- Xinference
- LiteLLM
- OneAPI
- NewAPI

## P4：产品形态扩展

- 做浏览器插件。
- 做 Tauri 桌面版。
- 做一键导入 Cursor / Continue / Cline。
- 做社区知识库。
- 做配置纠错机器人。

## 持续工程事项

- 保持现有抓取、AI 分析、保存、测试闭环稳定。
- 不为新定位大规模推翻已有代码。
- 优先复用 `rawAnalysisJson`，确有查询性能或筛选需求时再新增数据库字段。
- 增加前端 E2E 和关键 API 回归测试。
- 不在日志或测试记录中保存 API Key。
