# Model Plunger 易用化核心功能优化计划

## 1. 目标

把 Model Plunger 从“模型接入知识库 + 连通性测试工具”，升级成“模型接入向导 + 最小成本能力测试台”。

用户理想路径：

1. 选择模型平台或模型服务。
2. 选择要接入的软件、插件、SDK 或本地工具。
3. 系统自动显示对应的 Base URL、鉴权方式、模型名、配置片段、接入步骤和注意事项。
4. 用户输入 URL、API Key、模型名后，可选择用最少 token 做对话、编程、识别、Embedding、模型列表等测试。
5. 测试前明确提示：这些测试会调用真实模型接口并消耗 token 或额度。
6. 测试后给出成功状态、失败原因、修复建议、可复制配置和测试记录。

## 2. 核心功能一：模型 + 接入软件向导

### 2.1 用户场景

用户常见问题不是“这个平台能不能用”，而是：

- 我想把 DeepSeek / OpenAI / Gemini / Qwen / Ollama 接到 Cursor、Cline、Continue、Cherry Studio、Open WebUI、Dify、LangChain、OpenAI SDK，应该填什么？
- Base URL 到底要不要带 `/v1`？
- Header 用 `Authorization: Bearer`，还是 `x-goog-api-key`？
- 模型名应该填平台模型 ID，还是软件里的别名？
- 这个软件支不支持 Vision、Embedding、Tools、JSON mode？

因此需要新增一个“接入向导”页面，核心不是堆文档，而是让用户通过两次选择得到精确配置。

### 2.2 推荐页面

新增页面：`/connect`

页面结构：

- Provider 选择：OpenAI Compatible、OpenAI、DeepSeek、Qwen、Gemini、Anthropic、Moonshot、SiliconFlow、OpenRouter、Ollama、LM Studio、vLLM、LiteLLM、OneAPI、NewAPI 等。
- 模型选择：从知识库已保存模型读取，也允许手动输入。
- 接入目标选择：Cursor、Cline / Roo Code、Continue、Cherry Studio、Open WebUI、Dify、LangChain、OpenAI SDK、curl、自定义 OpenAI Compatible 客户端。
- 能力标签：Chat、Code、Vision、Embedding、Tools、JSON mode、Streaming、Reasoning、本地模型。
- 输出区：Base URL、API Key 填写位置、模型名、环境变量、JSON 配置、curl 示例、常见错误。
- 操作区：复制 Base URL、复制配置、跳转测试、保存为模板。

### 2.3 输出内容

每组“Provider + 接入目标”应输出：

- `baseUrl`: 接口根地址，例如 OpenAI Compatible 通常为 `https://example.com/v1`。
- `authType`: `bearer`、`api-key-header`、`query-key`、`none` 等。
- `authHeaderName`: 例如 `Authorization` 或 `x-goog-api-key`。
- `modelNameRule`: 模型名填写规则。
- `softwareConfig`: 对应软件的配置片段。
- `envExample`: 环境变量示例。
- `curlExample`: 最小请求示例。
- `warnings`: 是否消耗 token、是否可能产生费用、是否需要特殊代理、是否不兼容 OpenAI 格式。
- `knownPitfalls`: 常见错误，如重复 `/v1`、模型名错误、Key 权限不足、地区限制、余额不足、CORS、网络代理。

### 2.4 模板系统

建议新增“接入模板”概念，不要把所有软件规则写死在页面里。

推荐数据结构：

```ts
type IntegrationTarget = {
  id: string;
  name: string;
  category: "editor" | "desktop-client" | "web-ui" | "agent-framework" | "sdk" | "cli" | "custom";
  supportedProtocols: Array<"openai-compatible" | "ollama" | "gemini" | "anthropic" | "custom">;
  configFormat: "json" | "env" | "yaml" | "toml" | "curl" | "text";
  requiredFields: string[];
  optionalFields: string[];
  notes: string[];
};

type ProviderAccessProfile = {
  providerId: string;
  protocol: "openai-compatible" | "ollama" | "gemini" | "anthropic" | "custom";
  defaultBaseUrl?: string;
  baseUrlHints: string[];
  authType: "bearer" | "api-key-header" | "none" | "custom";
  authHeaderName?: string;
  modelNameExamples: string[];
  capabilityHints: string[];
  pitfalls: string[];
};
```

### 2.5 API 建议

新增或扩展以下接口：

- `GET /api/integrations/targets`
  - 返回支持的接入软件、SDK、客户端列表。
- `GET /api/integrations/profiles`
  - 返回 Provider 接入画像。
- `POST /api/integrations/render`
  - 输入 `providerId`、`targetId`、`baseUrl`、`modelName`，返回配置片段和说明。
- `POST /api/check/test`
  - 扩展现有测试类型，支持更多能力测试。

## 3. 核心功能二：最小 token 模型接入测试

### 3.1 测试入口

测试入口可以放在两个位置：

- `/connect`：用户生成配置后立即测试。
- `/providers/:id`：已有 Provider 详情页继续保留并增强测试。

### 3.2 测试前提示

所有会真实调用模型的测试按钮旁必须有明确提示：

> 测试会调用真实模型接口，可能消耗 token、额度或产生费用。建议先使用最小输出测试。

如果选择 Vision、Embedding、编程、Tools、长上下文等测试，提示应更明显，因为这些能力可能比普通 `models` 查询更容易产生费用。

### 3.3 测试类型

推荐测试类型从低成本到高成本排列：

1. `models`
   - 请求模型列表。
   - 通常不消耗生成 token，但不同平台可能计入请求额度。
   - 用于验证 Base URL、Key、网络和基本鉴权。

2. `chat-min`
   - 最小对话测试。
   - Prompt：`Reply with exactly: ok`
   - `max_tokens`: 3 到 8。
   - `temperature`: 0。
   - 目标：验证 Chat Completions 或等价接口可用。

3. `code-min`
   - 最小编程能力测试。
   - Prompt：`Return only a JavaScript function name for adding two numbers.`
   - `max_tokens`: 8 到 16。
   - 目标：验证模型能完成代码类输出，不追求质量评测。

4. `json-min`
   - JSON 输出测试。
   - Prompt：`Return only JSON: {"ok":true}`
   - `max_tokens`: 12 到 24。
   - 目标：验证 JSON mode 或普通 JSON 输出可用。

5. `embedding-min`
   - 输入单词：`hello`
   - 目标：验证 Embedding endpoint、向量维度和响应结构。

6. `vision-min`
   - 使用极小测试图片，例如 1x1 或简单单色图片。
   - Prompt：`What color is this? Answer one word.`
   - `max_tokens`: 3 到 8。
   - 目标：验证图像输入链路。

7. `stream-min`
   - 使用最短 Prompt 和短输出验证流式响应。
   - 目标：确认客户端、代理、服务端流处理可用。

8. `tools-min`
   - 使用一个无副作用的 mock tool schema。
   - 目标：验证工具调用格式，不执行真实外部动作。

### 3.4 测试结果

每次测试结果建议保存：

- Provider / Model / Base URL。
- 测试类型。
- 成功或失败。
- HTTP 状态码。
- 错误归类。
- 修复建议。
- 耗时。
- 返回 token 用量，如果平台返回 usage。
- 请求摘要，不保存完整 API Key。
- 响应摘要，避免存储过长内容或敏感内容。

### 3.5 错误诊断分类

建议把失败归类成可读错误：

- `auth_failed`: API Key 错误、权限不足、Header 错误。
- `base_url_invalid`: URL 不合法、重复 `/v1`、路径不匹配。
- `model_not_found`: 模型名不存在或当前 Key 无权限。
- `quota_or_billing`: 余额不足、额度耗尽、账单未开启。
- `rate_limited`: 速率限制。
- `network_error`: DNS、代理、TLS、超时。
- `schema_mismatch`: 响应不是预期格式。
- `capability_unsupported`: 模型或平台不支持该能力。

## 4. 其他值得加入的易用化功能

### 4.1 智能 URL 纠错

用户输入 Base URL 后自动检查：

- 是否缺少协议头。
- 是否重复 `/v1/v1`。
- 是否把完整 endpoint 当成 Base URL。
- OpenAI Compatible 是否应使用 `/v1`。
- Ollama 是否应使用本地端口。
- Gemini / Anthropic 是否不是 OpenAI Compatible 路径。

### 4.2 软件配置复制器

对每个接入目标提供“复制配置”按钮：

- 复制环境变量。
- 复制 JSON 配置。
- 复制 curl 命令。
- 复制 SDK 初始化代码。
- 复制“给 AI 编程软件的接入说明”。

### 4.3 Provider 能力矩阵

在 `/compare` 或新增 `/capabilities` 页面展示：

- Chat、Vision、Embedding、Tools、JSON mode、Streaming、Reasoning。
- 官方 API、OpenAI Compatible、本地服务、中转服务。
- 是否支持模型列表接口。
- 推荐接入软件。
- 最近一次测试状态。

### 4.4 安全与隐私体验

- API Key 默认只保存在当前表单，不落库。
- 如果后续需要保存 Key，应加密保存，并让用户明确开启。
- 测试记录不保存完整 Key。
- 日志永远脱敏。
- 导出知识库时默认不包含 Key。

### 4.5 新手模式与专家模式

新手模式：

- 只显示 Provider、模型、接入软件、Base URL、API Key 和测试按钮。
- 错误提示使用自然语言。

专家模式：

- 展示完整请求体、Headers、响应体摘要、usage、latency、endpoint、raw config。
- 允许调整 max tokens、temperature、timeout、proxy、headers。

### 4.6 成本保护

- 默认测试使用最小 token。
- 所有生成测试默认 `temperature: 0`。
- 默认不开启批量测试。
- 批量测试前二次确认。
- Vision、长上下文、图片生成、音频测试应有更醒目的费用提醒。
- 如果平台返回 `usage`，在结果中显示本次消耗。

## 5. 推荐实现顺序

### P0：先把核心路径跑通

1. 新增 `/connect` 页面。
2. 内置首批接入目标模板：OpenAI SDK、curl、Cursor、Cline / Roo Code、Continue、Cherry Studio、自定义 OpenAI Compatible。
3. 内置首批 Provider 接入画像：OpenAI Compatible、OpenAI、DeepSeek、Gemini、Ollama、OpenRouter、SiliconFlow。
4. 实现 `POST /api/integrations/render`，先返回模板化配置，不要求入库。
5. 扩展测试提示文案，所有测试按钮明确说明会消耗 token 或额度。

### P1：增强测试能力

1. 在 `POST /api/check/test` 中新增 `chat-min`、`code-min`、`json-min`。
2. 统一测试请求参数：`baseUrl`、`apiKey`、`modelName`、`providerProtocol`、`testType`。
3. 后端强制最小 token 默认值，避免前端误传大输出。
4. 测试记录加入 `usage`、`latencyMs`、`diagnosisCode`。

### P2：能力矩阵与软件模板库

1. 新增能力字段到 Provider / Model。
2. `/compare` 增加能力列和最近测试状态。
3. 模板支持版本号和来源说明。
4. 允许用户保存自定义接入模板。

### P3：更高级能力测试

1. `embedding-min`。
2. `vision-min`。
3. `stream-min`。
4. `tools-min`。
5. 批量能力测试，但默认关闭。

## 6. 验收标准

完成 P0 后，用户应该可以：

- 进入 `/connect`。
- 选择一个 Provider。
- 选择一个模型或手动输入模型名。
- 选择一个接入软件。
- 看到 Base URL、鉴权方式、模型名填写方式、配置片段和常见错误。
- 一键复制配置。
- 点击测试前看到 token / 额度消耗提示。
- 执行最小对话测试。
- 看到成功结果或可执行的失败修复建议。

完成 P1 后，用户应该可以：

- 选择对话、编程、JSON 三种最小测试。
- 每种测试都限制最小输出 token。
- 测试记录可查看 usage、耗时和诊断分类。
- API Key 不会在页面、日志、导出数据中明文泄露。

## 7. 给编程软件的下一步优化提示词

可以把下面这段直接发给 Cursor、Cline、Roo Code、Continue 或其他编程软件：

```text
请阅读项目根目录的 README.md、PROJECT_STATUS.md、FUTURE_ROADMAP.md 和 USABILITY_OPTIMIZATION_PLAN.md。

目标：实现 Model Plunger 的 P0 易用化核心路径。

请优先完成：
1. 新增前端页面 /connect，用于选择 Provider、模型、接入目标软件，并展示 Base URL、鉴权方式、模型名规则、配置片段、curl 示例、常见错误和复制按钮。
2. 在后端新增集成模板接口：
   - GET /api/integrations/targets
   - GET /api/integrations/profiles
   - POST /api/integrations/render
3. 先用内置静态模板实现，不要引入新的数据库迁移，避免扩大改动范围。
4. 首批支持 OpenAI Compatible、OpenAI、DeepSeek、Gemini、Ollama、OpenRouter、SiliconFlow。
5. 首批支持 curl、OpenAI SDK、Cursor、Cline / Roo Code、Continue、Cherry Studio、自定义 OpenAI Compatible 客户端。
6. 在测试按钮附近明确提示：测试会调用真实模型接口，可能消耗 token、额度或产生费用。
7. 复用现有 POST /api/check/test 能力；如果需要扩展，先增加 chat-min、code-min、json-min 三种低成本测试。
8. 所有 API Key 必须脱敏，不要写入日志，不要写入测试记录。
9. 保持现有架构：apps/api 使用 Fastify + Zod，apps/web 使用 React + TypeScript + TanStack Query + React Router。
10. 完成后更新 PROJECT_STATUS.md，并补充必要的 Vitest 测试。

验收：npm run build 和 npm run test 可以通过；用户能在 /connect 生成配置、复制配置，并从该页面发起最小 token 测试。
```

## 8. 建议拆分给编程软件的任务

如果希望降低一次性改动风险，可以分三轮给编程软件：

第一轮：只做模板接口和后端测试。

```text
只实现 USABILITY_OPTIMIZATION_PLAN.md 中的 P0 后端部分：GET /api/integrations/targets、GET /api/integrations/profiles、POST /api/integrations/render。使用静态模板，不做数据库迁移。补充 Vitest inject 测试。
```

第二轮：只做 `/connect` 页面。

```text
基于后端集成模板接口实现 /connect 页面。要求 Provider、模型名、接入目标软件可选；展示配置片段、curl 示例、常见错误、复制按钮；测试按钮旁显示 token/额度消耗提示。
```

第三轮：扩展最小 token 测试。

```text
扩展 POST /api/check/test，新增 chat-min、code-min、json-min。后端强制低 max_tokens，返回 usage、latencyMs、diagnosisCode。不要保存完整 API Key。补充测试并更新 PROJECT_STATUS.md。
```
