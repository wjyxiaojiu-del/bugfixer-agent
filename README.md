# Bugfixer Agent 🔧

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)

**自动 Bug 诊断与修复工具** — 给 vibe coder 的智能调试助手

> 你的项目出 bug 了？Bugfixer Agent 帮你自动采集证据、诊断根因、给出修复方案。

## 特性

- 🔍 **自动栈识别** — 检测框架、数据库、部署目标
- 📊 **三层证据采集** — 终端输出 + 浏览器网络 + 云端 API
- 🧠 **20+ 诊断规则** — 覆盖常见 bug 模式
- 🤖 **LLM 兜底** — 规则没命中时调 AI 分析
- 🔧 **自动修复** — 一键应用修复方案，支持回滚
- 📚 **知识库** — 诊断过的问题自动沉淀

## 支持的框架

| 框架 | 检测 | Dev 命令 |
|------|------|----------|
| Next.js | ✅ | `npx next dev` |
| Nuxt | ✅ | `npx nuxi dev` |
| SvelteKit | ✅ | `npx vite dev` |
| Remix | ✅ | `npx remix dev` |
| Astro | ✅ | `npx astro dev` |
| Vite | ✅ | `npx vite` |

## 支持的数据库

| 数据库 | 检测 | L3 证据 | 诊断规则 |
|--------|------|---------|----------|
| Supabase | ✅ | RLS 策略、拒绝日志 | 4 条 |
| Firebase | ✅ | Firestore rules | 4 条 |
| PlanetScale | ✅ | 数据库/分支信息 | 3 条 |
| Neon | ✅ | 项目/分支信息 | 3 条 |
| MongoDB Atlas | ✅ | 项目/集群信息 | 3 条 |

## 安装

```bash
# 直接运行（推荐）
npx github:wjyxiaojiu-del/bugfixer-agent

# 或者全局安装
npm install -g github:wjyxiaojiu-del/bugfixer-agent
```

### 依赖要求

- Node.js >= 20
- Playwright（用于浏览器采集）

```bash
# 安装 Playwright 浏览器
npx playwright install chromium
```

## 快速开始

```bash
# 1. 进入项目目录
cd your-project

# 2. 检测技术栈
npx github:wjyxiaojiu-del/bugfixer-agent detect

# 3. 端到端诊断
npx github:wjyxiaojiu-del/bugfixer-agent repro

# 4. 启用 LLM 兜底（可选）
export CSI_LLM_PROVIDER=openai
export CSI_LLM_API_KEY=sk-xxx
npx github:wjyxiaojiu-del/bugfixer-agent repro
```

## 命令

### `bugfixer detect`

检测项目技术栈（框架、数据库、部署目标）

```bash
npx bugfixer detect
npx bugfixer detect --dir /path/to/project
```

输出示例：
```
🔍 栈识别结果

  框架       Next.js 14.2.0
  Supabase   ✓ @supabase/supabase-js
  Firebase   ✓ firebase
  部署       Vercel
  LLM        ✓ openai (gpt-4o-mini)
```

### `bugfixer repro`

端到端现场勘察 — 完整诊断流程

```bash
npx bugfixer repro
npx bugfixer repro --auto-fix          # 自动应用修复
npx bugfixer repro --dry-run           # 预览修复（不实际修改）
npx bugfixer repro --skip-cloud        # 跳过 L3 云端采集
npx bugfixer repro --dev-command "pnpm dev"  # 自定义 dev 命令
```

诊断流程：
```
detect → L1(终端) → L2(浏览器) → L3(云端) → 诊断 → 修复 → 知识库
```

### `bugfixer doctor`

检查环境和依赖是否就绪

```bash
npx bugfixer doctor
```

### `bugfixer fix list`

列出所有修复快照

```bash
npx bugfixer fix list
```

### `bugfixer fix rollback <id>`

回滚到指定快照

```bash
npx bugfixer fix rollback snapshot_123
```

### `bugfixer kb list`

列出知识库条目

```bash
npx bugfixer kb list
npx bugfixer kb search "RLS"
npx bugfixer kb show <entry-id>
```

## 配置

### 环境变量

| 变量 | 说明 |
|------|------|
| `CSI_LLM_PROVIDER` | LLM provider（`openai` / `anthropic` / `ollama`） |
| `CSI_LLM_API_KEY` | LLM API Key |
| `CSI_LLM_BASE_URL` | 自定义 API 地址（可选） |
| `CSI_LLM_MODEL` | 自定义模型名（可选） |
| `CSI_AUTO_FIX` | 自动修复（`true` / `false`） |
| `CSI_SKIP_CLOUD` | 跳过云端采集（`true` / `false`） |

### 配置文件

在项目根目录创建 `.csi/config.json`：

```json
{
  "llm": {
    "provider": "openai",
    "apiKey": "sk-xxx",
    "model": "gpt-4o-mini"
  },
  "autoFix": false,
  "skipCloud": false
}
```

### 数据库 Token

| 数据库 | 环境变量 | 获取方式 |
|--------|----------|----------|
| Supabase | `SUPABASE_ACCESS_TOKEN` | `supabase login` |
| Firebase | `FIREBASE_TOKEN` | `firebase login` |
| PlanetScale | `PLANETSCALE_SERVICE_TOKEN_ID` + `PLANETSCALE_SERVICE_TOKEN` | `pscale auth login` |
| Neon | `NEON_API_KEY` | `neonctl auth` |
| MongoDB | `MONGODB_ATLAS_PUBLIC_KEY` + `MONGODB_ATLAS_PRIVATE_KEY` | `atlas auth login` |

## 诊断规则

### L1 终端规则（7 条）

| 规则 | 匹配模式 | 严重程度 |
|------|----------|----------|
| TypeScript 错误 | `TS\d{4}:` | ⚠️ warning |
| Hydration 不匹配 | `Hydration failed` | ⚠️ warning |
| CORS 错误 | `CORS` / `Access-Control-Allow-Origin` | 🔴 critical |
| 环境变量缺失 | `is not defined` | 🔴 critical |
| 端口占用 | `EADDRINUSE` | ⚠️ warning |
| Webpack 构建错误 | `Module build failed` | ⚠️ warning |
| Turbopack 错误 | `Turbopack` | ⚠️ warning |

### L2 网络规则（8 条）

| 规则 | 匹配模式 | 严重程度 |
|------|----------|----------|
| API 路由 404 | status 404 + `/api/` | ⚠️ warning |
| 请求限流 | status 429 | ⚠️ warning |
| 请求体过大 | status 413 | ⚠️ warning |
| 网关错误 | status 502/503/504 | ⚠️ warning |
| CORS Preflight 失败 | OPTIONS 4xx+ | 🔴 critical |
| React 状态循环 | `Maximum update depth` | 🔴 critical |
| 未捕获 Promise | `UnhandledPromiseRejection` | ⚠️ warning |
| API 废弃警告 | `deprecated` | ℹ️ info |

### L2 数据库规则（8 条）

| 规则 | 数据库 | 严重程度 |
|------|--------|----------|
| RLS 拒绝 | Supabase | 🔴 critical |
| 认证过期 | Supabase | 🔴 critical |
| 权限拒绝 | Firebase | 🔴 critical |
| 认证错误 | Firebase | 🔴 critical |
| 配额超限 | Firebase | ⚠️ warning |
| 连接错误 | PlanetScale | 🔴 critical |
| 连接错误 | Neon | 🔴 critical |
| 认证失败 | MongoDB | 🔴 critical |

### L3 云端规则（5 条）

| 规则 | 数据库 | 严重程度 |
|------|--------|----------|
| RLS 拒绝日志 | Supabase | ⚠️ warning |
| 权限拒绝日志 | Firebase | ⚠️ warning |
| 云端错误 | PlanetScale | ⚠️ warning |
| 云端错误 | Neon | ⚠️ warning |
| 云端错误 | MongoDB | ⚠️ warning |

## LLM 集成

CSI Agent 支持三种 LLM provider：

### OpenAI

```bash
export CSI_LLM_PROVIDER=openai
export CSI_LLM_API_KEY=sk-xxx
```

### Anthropic

```bash
export CSI_LLM_PROVIDER=anthropic
export CSI_LLM_API_KEY=sk-ant-xxx
```

### Ollama（本地、免费）

```bash
# 安装 Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 拉取模型
ollama pull llama3.1

# 配置
export CSI_LLM_PROVIDER=ollama
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        CSI Agent                            │
├─────────────────────────────────────────────────────────────┤
│  detect (栈识别)                                             │
│    ├─ Framework: next/nuxt/sveltekit/remix/astro/vite       │
│    ├─ Database: supabase/firebase/planetscale/neon/mongodb   │
│    └─ Deploy: vercel/netlify                                │
├─────────────────────────────────────────────────────────────┤
│  evidence (证据采集)                                         │
│    ├─ L1: 终端输出 (PTY)                                     │
│    ├─ L2: 浏览器 (Playwright/CDP)                            │
│    └─ L3: 云端 API (Provider 架构)                           │
├─────────────────────────────────────────────────────────────┤
│  diagnose (诊断引擎)                                         │
│    ├─ 规则引擎 (20+ 条规则)                                   │
│    ├─ LLM 兜底 (OpenAI/Anthropic/Ollama)                     │
│    └─ 模式识别 (网络请求 + 控制台)                             │
├─────────────────────────────────────────────────────────────┤
│  fix (修复引擎)                                              │
│    ├─ SQL Migration                                         │
│    ├─ Code Change                                           │
│    ├─ Env Change                                            │
│    └─ 快照回滚                                               │
├─────────────────────────────────────────────────────────────┤
│  knowledge (知识库)                                          │
│    └─ 栈+症状+根因+修复 → 复利增长                             │
└─────────────────────────────────────────────────────────────┘
```

## 输出文件

CSI Agent 在项目目录下创建 `.csi/` 目录：

```
.csi/
├── screenshots/     # 浏览器截图
├── captures/        # 网络采集数据
├── reports/         # 诊断报告 (JSON)
├── snapshots/       # 修复快照（可回滚）
├── knowledge/       # 知识库
│   └── entries.json
└── config.json      # 配置文件
```

## CI 集成

### GitHub Action

CSI Agent 可以作为 GitHub Action 使用，在部署后自动巡检。

**快速开始：**

1. 在项目根目录创建 `.github/workflows/csi-check.yml`：

```yaml
name: CSI 诊断巡检

on:
  deployment_status:
  workflow_dispatch:

jobs:
  csi-check:
    runs-on: ubuntu-latest
    if: >
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'deployment_status' && github.event.deployment_status.state == 'success')

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npx playwright install chromium --with-deps

      - name: 运行 CSI 诊断
        uses: your-username/csi-agent@v1
        with:
          skip-cloud: 'true'
          fail-on-severity: 'critical'
```

2. 在 GitHub Secrets 中配置（可选）：
   - `CSI_LLM_PROVIDER` — LLM provider
   - `CSI_LLM_API_KEY` — LLM API Key
   - 数据库 Token（按需配置）

**Action Inputs：**

| Input | 说明 | 默认值 |
|-------|------|--------|
| `project-dir` | 项目目录 | `.` |
| `dev-command` | 自定义 dev 命令 | 自动检测 |
| `ready-timeout` | 等待超时（ms） | `30000` |
| `skip-cloud` | 跳过云端采集 | `true` |
| `fail-on-severity` | 失败级别 | `critical` |
| `auto-fix` | 自动修复 | `false` |

**Action Outputs：**

| Output | 说明 |
|--------|------|
| `diagnosis` | 诊断结果（JSON） |
| `severity` | 严重程度 |
| `report-path` | 报告文件路径 |

### CLI CI 模式

在 CI 中使用 CLI 命令：

```bash
# JSON 输出 + 退出码
npx bugfixer repro --json --fail-on-severity critical

# 退出码：
# 0 = 无问题或问题级别低于阈值
# 1 = 诊断发现问题且级别 >= fail-on-severity
# 2 = 运行出错
```

### Vercel 集成

在 Vercel 部署后自动运行：

```json
// vercel.json
{
  "hooks": {
    "post-deploy": "npx bugfixer repro --skip-cloud --json"
  }
}
```

## 开发

```bash
# 克隆项目
git clone https://github.com/your-username/csi-agent.git
cd csi-agent

# 安装依赖
npm install

# 开发模式
npm run dev

# 运行测试
npm run test

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 扩展

### 添加新数据库

```typescript
// src/evidence/l3/turso.ts
import type { DatabaseProvider } from './provider.js'

export const tursoProvider: DatabaseProvider = {
  name: 'turso',

  detect(pkg, env) {
    // 检测逻辑
  },

  async collectEvidence(config) {
    // 证据采集
  },

  getUrlPatterns() {
    return [/\.turso\.io/]
  },
}

// src/stack/detect.ts
import { tursoProvider } from '../evidence/l3/turso.js'
registerProvider(tursoProvider)
```

### 添加新诊断规则

```typescript
// src/diagnose/rules.ts
import { registerRule } from './rules.js'

registerRule({
  id: 'my_custom_rule',
  name: '自定义规则',
  evaluate(evidence) {
    // 匹配逻辑
    if (!matches) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: '问题描述',
      recommendedFix: {
        type: 'manual',
        title: '修复标题',
        description: '修复步骤',
      },
      confidence: 'high',
      evidenceSummary: '证据摘要',
    }
  },
})
```

### 添加新模式

```typescript
// src/evidence/l2/recognizer.ts
import { registerPattern } from './recognizer.js'

registerPattern({
  type: 'my_pattern',
  severity: 'warning',
  match(entry) {
    // 匹配逻辑
    if (!matches) return null
    return `匹配消息: ${entry.url}`
  },
})
```

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与。

## License

MIT
