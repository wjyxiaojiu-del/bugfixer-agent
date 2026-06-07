import type { AggregatedEvidence } from './evidence.js'
import type { Diagnosis, RootCauseType } from './analyze.js'

// ═══════════════════════════════════════
// 规则注册系统
// ═══════════════════════════════════════

export interface DiagnosisRule {
  /** 唯一标识 */
  id: string
  /** 人类可读名称 */
  name: string
  /** 返回 Diagnosis 表示匹配，null 表示不适用 */
  evaluate(evidence: AggregatedEvidence): Diagnosis | null
}

/** 规则注册表 */
export const rules: DiagnosisRule[] = []

/** 注册规则 */
export function registerRule(rule: DiagnosisRule): void {
  rules.push(rule)
}

// ═══════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════

function extractTableName(url: string): string | null {
  const match = url.match(/\/rest\/v1\/([^?/]+)/)
  return match ? match[1] : null
}

function extractModuleName(error: string): string | null {
  const match = error.match(/Cannot find module '([^']+)'/) || error.match(/Module not found: ([^\s]+)/)
  return match ? match[1] : null
}

function extractTSErrorCode(error: string): string | null {
  const match = error.match(/TS(\d{4})/)
  return match ? `TS${match[1]}` : null
}

function extractStructuredError(line: string): { file?: string; line?: number; column?: number; code?: string } | null {
  // 匹配 src/app/page.tsx:15:3 或 src/app/page.tsx(15,3)
  const fileMatch = line.match(/([\w./-]+\.\w+)[:(\s](\d+)[,:]\s*(\d+)/)
  if (fileMatch) {
    return {
      file: fileMatch[1],
      line: parseInt(fileMatch[2], 10),
      column: parseInt(fileMatch[3], 10),
      code: extractTSErrorCode(line) || undefined,
    }
  }
  // 匹配纯错误码
  const code = extractTSErrorCode(line)
  if (code) return { code }
  return null
}

function generateRlsFix(tableName: string | null): string {
  if (!tableName) return '-- 无法确定表名，请手动指定'
  return `-- 为 ${tableName} 添加 INSERT 策略（允许认证用户插入自己的数据）
CREATE POLICY "allow_authenticated_insert_${tableName}"
ON "${tableName}"
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 为 ${tableName} 添加 SELECT 策略（允许认证用户读取）
CREATE POLICY "allow_authenticated_select_${tableName}"
ON "${tableName}"
FOR SELECT
TO authenticated
USING (true);`
}

// ═══════════════════════════════════════
// 原有 5 条规则（从 analyze.ts 迁移）
// ═══════════════════════════════════════

registerRule({
  id: 'rls_denied',
  name: 'RLS 策略拒绝',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'rls_denied')
    if (!issue) return null

    const tableName = extractTableName(issue.entry.url)
    return {
      rootCause: 'rls_missing_policy',
      severity: 'critical',
      description: `RLS 策略拒绝了对 ${tableName || '未知表'} 的请求。Postgres 错误码 42501 = 权限不足。`,
      recommendedFix: {
        type: 'sql_migration',
        title: `为 ${tableName || '表'} 添加 INSERT/UPDATE RLS 策略`,
        description: `需要为相关角色添加 RLS 策略，允许合法操作。`,
        content: generateRlsFix(tableName),
        rollback: `DROP POLICY IF EXISTS "allow_authenticated_${tableName}" ON "${tableName}";`,
      },
      confidence: 'high',
      evidenceSummary: `网络请求 ${issue.entry.url} 返回 42501`,
    }
  },
})

registerRule({
  id: 'auth_expired',
  name: '认证过期',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'auth_error')
    if (!issue) return null

    return {
      rootCause: 'auth_expired',
      severity: 'critical',
      description: 'Supabase 认证 token 已过期或无效，需要重新登录。',
      recommendedFix: {
        type: 'manual',
        title: '重新登录 Supabase',
        description: '运行 supabase login 重新获取 token',
      },
      confidence: 'high',
      evidenceSummary: `认证请求 ${issue.entry.url} 返回 ${issue.entry.status}`,
    }
  },
})

registerRule({
  id: 'module_not_found',
  name: '缺少依赖模块',
  evaluate(evidence) {
    const moduleError = evidence.terminal.errors.find(e =>
      e.includes('Cannot find module') || e.includes('Module not found')
    )
    if (!moduleError) return null

    const moduleName = extractModuleName(moduleError)
    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: `缺少依赖模块: ${moduleName || '未知'}`,
      recommendedFix: {
        type: 'code_change',
        title: `安装缺失模块`,
        description: `运行 npm install ${moduleName || '<module>'}`,
        content: `npm install ${moduleName || '<module>'}`,
      },
      confidence: 'medium',
      evidenceSummary: moduleError,
    }
  },
})

registerRule({
  id: 'server_error',
  name: '服务端错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'server_error')
    if (!issue) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: `服务端错误: ${issue.entry.url} → ${issue.entry.status}`,
      recommendedFix: {
        type: 'manual',
        title: '检查服务端日志',
        description: '需要查看 Supabase Dashboard 的日志详情',
      },
      confidence: 'medium',
      evidenceSummary: issue.message,
    }
  },
})

registerRule({
  id: 'cloud_rls_denials',
  name: '云端 RLS 拒绝日志',
  evaluate(evidence) {
    if (!evidence.cloud?.denials || evidence.cloud.denials.length === 0) return null
    if (evidence.cloud.provider !== 'supabase') return null

    return {
      rootCause: 'rls_overly_restrictive',
      severity: 'warning',
      description: `云端日志发现 ${evidence.cloud.denials.length} 条 RLS 拒绝记录，但浏览器未捕获到。`,
      recommendedFix: {
        type: 'manual',
        title: '检查 RLS 策略',
        description: '运行 csi doctor --live 查看详细策略',
      },
      confidence: 'medium',
      evidenceSummary: `云端 ${evidence.cloud.denials.length} 条 42501 日志`,
    }
  },
})

// ═══════════════════════════════════════
// Firebase 规则（4 条）
// ═══════════════════════════════════════

registerRule({
  id: 'firebase_permission_denied',
  name: 'Firebase 权限拒绝',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'firebase_permission_denied')
    if (!issue) return null

    return {
      rootCause: 'rls_missing_policy',
      severity: 'critical',
      description: 'Firebase 安全规则拒绝了请求。需要更新 firestore.rules 文件。',
      recommendedFix: {
        type: 'code_change',
        title: '更新 Firestore 安全规则',
        description: '检查 firestore.rules 文件，确保当前用户有读写权限',
        content: `// firestore.rules - 允许认证用户读写（仅开发环境）
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`,
      },
      confidence: 'high',
      evidenceSummary: `Firebase 权限拒绝: ${issue.entry.url}`,
    }
  },
})

registerRule({
  id: 'firebase_auth_error',
  name: 'Firebase 认证错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'firebase_auth_error')
    if (!issue) return null

    return {
      rootCause: 'auth_expired',
      severity: 'critical',
      description: 'Firebase 认证失败。可能是 token 过期或凭据无效。',
      recommendedFix: {
        type: 'manual',
        title: '重新登录 Firebase',
        description: '1. 检查 Firebase Auth 配置\n2. 运行 firebase login 重新认证\n3. 检查 API Key 是否正确',
      },
      confidence: 'high',
      evidenceSummary: `Firebase 认证错误: ${issue.entry.url} → ${issue.entry.status}`,
    }
  },
})

registerRule({
  id: 'firebase_quota_exceeded',
  name: 'Firebase 配额超限',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'firebase_quota_exceeded')
    if (!issue) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: 'Firebase 配额已超限。可能需要升级计划或优化查询频率。',
      recommendedFix: {
        type: 'manual',
        title: '检查 Firebase 配额',
        description: '1. 登录 Firebase Console 查看用量\n2. 考虑添加缓存减少请求\n3. 升级到 Blaze 计划（按量付费）',
      },
      confidence: 'high',
      evidenceSummary: `Firebase 配额超限: ${issue.entry.url}`,
    }
  },
})

registerRule({
  id: 'firebase_cloud_rls_denials',
  name: 'Firebase 云端权限拒绝日志',
  evaluate(evidence) {
    if (!evidence.cloud?.denials || evidence.cloud.denials.length === 0) return null
    if (evidence.cloud.provider !== 'firebase') return null

    return {
      rootCause: 'rls_overly_restrictive',
      severity: 'warning',
      description: `Firebase 云端日志发现 ${evidence.cloud.denials.length} 条权限拒绝记录。`,
      recommendedFix: {
        type: 'manual',
        title: '检查 Firestore 安全规则',
        description: '查看 Firebase Console 的 Firestore Rules 配置',
      },
      confidence: 'medium',
      evidenceSummary: `Firebase 云端 ${evidence.cloud.denials.length} 条权限拒绝日志`,
    }
  },
})

// ═══════════════════════════════════════
// PlanetScale 规则（3 条）
// ═══════════════════════════════════════

registerRule({
  id: 'planetscale_error',
  name: 'PlanetScale 错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'planetscale_error')
    if (!issue) return null

    return {
      rootCause: 'api_error',
      severity: 'critical',
      description: 'PlanetScale 数据库连接或权限错误。',
      recommendedFix: {
        type: 'manual',
        title: '检查 PlanetScale 连接',
        description: '1. 检查 DATABASE_URL 是否正确\n2. 检查数据库分支是否存在\n3. 运行 pscale auth login 重新认证',
      },
      confidence: 'high',
      evidenceSummary: `PlanetScale 错误: ${issue.entry.url} → ${issue.entry.status}`,
    }
  },
})

registerRule({
  id: 'planetscale_branch_error',
  name: 'PlanetScale 分支错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'planetscale_branch_error')
    if (!issue) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: 'PlanetScale 分支操作失败。可能是分支不存在或 deploy request 冲突。',
      recommendedFix: {
        type: 'manual',
        title: '检查 PlanetScale 分支',
        description: '1. 运行 pscale branch list 查看分支\n2. 检查是否有未完成的 deploy request\n3. 确认分支名称拼写正确',
      },
      confidence: 'medium',
      evidenceSummary: `PlanetScale 分支错误: ${issue.message}`,
    }
  },
})

registerRule({
  id: 'planetscale_cloud_error',
  name: 'PlanetScale 云端错误',
  evaluate(evidence) {
    if (!evidence.cloud || evidence.cloud.provider !== 'planetscale') return null
    if (evidence.cloud.errors.length === 0) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: `PlanetScale 云端采集出错: ${evidence.cloud.errors[0]}`,
      recommendedFix: {
        type: 'manual',
        title: '检查 PlanetScale API Key',
        description: '1. 确认 PLANETSCALE_SERVICE_TOKEN_ID 和 PLANETSCALE_SERVICE_TOKEN 已设置\n2. 运行 pscale auth login 重新认证',
      },
      confidence: 'medium',
      evidenceSummary: evidence.cloud.errors[0],
    }
  },
})

// ═══════════════════════════════════════
// Neon 规则（3 条）
// ═══════════════════════════════════════

registerRule({
  id: 'neon_error',
  name: 'Neon 错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'neon_error')
    if (!issue) return null

    return {
      rootCause: 'network_error',
      severity: 'critical',
      description: 'Neon 数据库连接或端点错误。',
      recommendedFix: {
        type: 'manual',
        title: '检查 Neon 连接',
        description: '1. 检查 DATABASE_URL 是否指向正确的 endpoint\n2. 确认 Neon 项目未被暂停\n3. 检查分支是否存在',
      },
      confidence: 'high',
      evidenceSummary: `Neon 错误: ${issue.entry.url} → ${issue.entry.status}`,
    }
  },
})

registerRule({
  id: 'neon_branch_error',
  name: 'Neon 分支错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'neon_error' && i.message.includes('分支'))
    if (!issue) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: 'Neon 分支操作失败。可能是分支不存在或 endpoint 配置错误。',
      recommendedFix: {
        type: 'manual',
        title: '检查 Neon 分支',
        description: '1. 运行 neonctl branches list 查看分支\n2. 确认 endpoint 名称正确\n3. 检查 DATABASE_URL 中的 branch 名称',
      },
      confidence: 'medium',
      evidenceSummary: issue.message,
    }
  },
})

registerRule({
  id: 'neon_cloud_error',
  name: 'Neon 云端错误',
  evaluate(evidence) {
    if (!evidence.cloud || evidence.cloud.provider !== 'neon') return null
    if (evidence.cloud.errors.length === 0) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: `Neon 云端采集出错: ${evidence.cloud.errors[0]}`,
      recommendedFix: {
        type: 'manual',
        title: '检查 Neon API Key',
        description: '1. 确认 NEON_API_KEY 已设置\n2. 运行 neonctl auth 重新认证',
      },
      confidence: 'medium',
      evidenceSummary: evidence.cloud.errors[0],
    }
  },
})

// ═══════════════════════════════════════
// MongoDB Atlas 规则（3 条）
// ═══════════════════════════════════════

registerRule({
  id: 'mongodb_error',
  name: 'MongoDB 错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'mongodb_error')
    if (!issue) return null

    return {
      rootCause: 'api_error',
      severity: 'critical',
      description: 'MongoDB 连接或认证错误。',
      recommendedFix: {
        type: 'manual',
        title: '检查 MongoDB 连接',
        description: '1. 检查 MONGODB_URI 是否正确\n2. 确认数据库用户密码正确\n3. 检查 IP 白名单是否包含当前 IP',
      },
      confidence: 'high',
      evidenceSummary: `MongoDB 错误: ${issue.message}`,
    }
  },
})

registerRule({
  id: 'mongodb_api_error',
  name: 'MongoDB Atlas API 错误',
  evaluate(evidence) {
    const issue = evidence.recognizedIssues.find(i => i.type === 'mongodb_api_error')
    if (!issue) return null

    return {
      rootCause: 'auth_expired',
      severity: 'warning',
      description: 'MongoDB Atlas API 认证失败。',
      recommendedFix: {
        type: 'manual',
        title: '检查 MongoDB Atlas API Key',
        description: '1. 登录 MongoDB Atlas 检查 API Key\n2. 确认 API Key 有足够权限\n3. 设置 MONGODB_ATLAS_PUBLIC_KEY 和 MONGODB_ATLAS_PRIVATE_KEY',
      },
      confidence: 'high',
      evidenceSummary: `MongoDB Atlas API 错误: ${issue.entry.url} → ${issue.entry.status}`,
    }
  },
})

registerRule({
  id: 'mongodb_cloud_error',
  name: 'MongoDB 云端错误',
  evaluate(evidence) {
    if (!evidence.cloud || evidence.cloud.provider !== 'mongodb') return null
    if (evidence.cloud.errors.length === 0) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: `MongoDB Atlas 云端采集出错: ${evidence.cloud.errors[0]}`,
      recommendedFix: {
        type: 'manual',
        title: '检查 MongoDB Atlas API Key',
        description: '1. 确认 MONGODB_ATLAS_PUBLIC_KEY 和 MONGODB_ATLAS_PRIVATE_KEY 已设置\n2. 运行 atlas auth login 重新认证',
      },
      confidence: 'medium',
      evidenceSummary: evidence.cloud.errors[0],
    }
  },
})

// ═══════════════════════════════════════
// Sentry 规则（3 条）
// ═══════════════════════════════════════

registerRule({
  id: 'sentry_error',
  name: 'Sentry 错误追踪',
  evaluate(evidence) {
    if (!evidence.cloud || evidence.cloud.provider !== 'sentry') return null
    if (evidence.cloud.policies.length === 0) return null

    // policies 中存储的是 Sentry issues
    const issues = evidence.cloud.policies
    const latest = issues[0]

    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: `Sentry 发现 ${issues.length} 个未解决错误，最新: ${latest.tablename}`,
      recommendedFix: {
        type: 'manual',
        title: '查看 Sentry 错误详情',
        description: `错误位置: ${latest.qual || '未知'}\n影响用户: ${latest.roles[0] || '未知'}`,
      },
      confidence: 'high',
      evidenceSummary: `Sentry: ${latest.tablename} (${latest.cmd} 次)`,
    }
  },
})

registerRule({
  id: 'sentry_auth_error',
  name: 'Sentry 认证错误',
  evaluate(evidence) {
    if (!evidence.cloud || evidence.cloud.provider !== 'sentry') return null
    if (evidence.cloud.tokenOk) return null
    if (evidence.cloud.errors.length === 0) return null

    return {
      rootCause: 'auth_expired',
      severity: 'warning',
      description: 'Sentry API 认证失败。',
      recommendedFix: {
        type: 'manual',
        title: '检查 Sentry Auth Token',
        description: '1. 登录 Sentry 检查 API Token\n2. 设置 SENTRY_AUTH_TOKEN 环境变量\n3. 确认 Token 有足够权限',
      },
      confidence: 'high',
      evidenceSummary: evidence.cloud.errors[0],
    }
  },
})

registerRule({
  id: 'sentry_cloud_error',
  name: 'Sentry 云端错误',
  evaluate(evidence) {
    if (!evidence.cloud || evidence.cloud.provider !== 'sentry') return null
    if (evidence.cloud.tokenOk) return null
    if (evidence.cloud.errors.length === 0) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: `Sentry 云端采集出错: ${evidence.cloud.errors[0]}`,
      recommendedFix: {
        type: 'manual',
        title: '检查 Sentry 配置',
        description: '1. 确认 SENTRY_AUTH_TOKEN 已设置\n2. 确认 SENTRY_ORG 和 SENTRY_PROJECT 已设置',
      },
      confidence: 'medium',
      evidenceSummary: evidence.cloud.errors[0],
    }
  },
})

// ═══════════════════════════════════════
// 新增 L1 终端规则（7 条）
// ═══════════════════════════════════════

registerRule({
  id: 'typescript_error',
  name: 'TypeScript 编译错误',
  evaluate(evidence) {
    const tsError = evidence.terminal.errors.find(e => /TS\d{4}/.test(e))
    if (!tsError) return null

    const code = extractTSErrorCode(tsError)
    const structured = extractStructuredError(tsError)

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: `TypeScript 编译错误${code ? `: ${code}` : ''}${structured?.file ? ` (${structured.file}:${structured.line})` : ''}`,
      recommendedFix: {
        type: 'manual',
        title: '修复 TypeScript 错误',
        description: `检查类型定义，运行 tsc --noEloc 查看完整错误列表`,
        content: structured?.file ? `检查文件 ${structured.file} 第 ${structured.line} 行` : undefined,
      },
      confidence: 'high',
      evidenceSummary: tsError.trim(),
    }
  },
})

registerRule({
  id: 'hydration_mismatch',
  name: 'Hydration 不匹配',
  evaluate(evidence) {
    const hydrationError = evidence.terminal.errors.find(e =>
      /Hydration failed|did not match|hydrat/i.test(e)
    ) || evidence.console.find(e =>
      /Hydration failed|did not match|hydrat/i.test(e.text)
    )
    if (!hydrationError) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: 'SSR 和客户端渲染结果不一致（Hydration Mismatch）。常见原因：浏览器 API 在服务端执行、随机值、日期格式化。',
      recommendedFix: {
        type: 'code_change',
        title: '修复 Hydration 不匹配',
        description: '1. 检查是否在组件顶层使用了 window/document/localStorage\n2. 用 useEffect 包裹浏览器 API 调用\n3. 用 dynamic import 禁用 SSR（ssr: false）',
        content: `// 方案 1: useEffect 包裹
useEffect(() => {
  // 在这里访问 window/document
}, [])

// 方案 2: 动态导入禁用 SSR
const ClientOnly = dynamic(() => import('./ClientOnly'), { ssr: false })`,
      },
      confidence: 'high',
      evidenceSummary: typeof hydrationError === 'string' ? hydrationError : hydrationError.text,
    }
  },
})

registerRule({
  id: 'cors_error',
  name: 'CORS 跨域错误',
  evaluate(evidence) {
    const terminalCors = evidence.terminal.errors.find(e => /CORS|Access-Control-Allow-Origin/i.test(e))
    const consoleCors = evidence.console.find(e => /CORS|Access-Control-Allow-Origin/i.test(e.text))
    const networkCors = evidence.network.find(e => e.status === 0 && e.url.startsWith('http'))

    if (!terminalCors && !consoleCors && !networkCors) return null

    const summary = terminalCors || consoleCors?.text || networkCors?.url || 'CORS error'

    return {
      rootCause: 'network_error',
      severity: 'critical',
      description: 'CORS 跨域请求被拒绝。浏览器阻止了对不同源服务器的请求。',
      recommendedFix: {
        type: 'code_change',
        title: '配置 CORS',
        description: '在 API 路由中添加 CORS 头，或在 next.config.js 中配置 headers',
        content: `// next.config.js
async headers() {
  return [{
    source: '/api/:path*',
    headers: [
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
      { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
    ],
  }]
}`,
      },
      confidence: 'high',
      evidenceSummary: summary,
    }
  },
})

registerRule({
  id: 'env_missing',
  name: '环境变量缺失',
  evaluate(evidence) {
    const envError = evidence.terminal.errors.find(e =>
      /is not defined|env.*undefined|NEXT_PUBLIC_.*not|SUPABASE_.*not/i.test(e)
    )
    if (!envError) return null

    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: '环境变量未定义。可能是 .env 文件缺失或变量名拼写错误。',
      recommendedFix: {
        type: 'env_change',
        title: '检查环境变量配置',
        description: '1. 确认 .env.local 文件存在\n2. 检查变量名拼写\n3. Next.js 客户端变量需要 NEXT_PUBLIC_ 前缀\n4. 修改 .env 后需要重启 dev server',
      },
      confidence: 'high',
      evidenceSummary: envError,
    }
  },
})

registerRule({
  id: 'port_in_use',
  name: '端口占用',
  evaluate(evidence) {
    const portError = evidence.terminal.errors.find(e =>
      /EADDRINUSE|port.*already|address already in use/i.test(e)
    )
    if (!portError) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: '端口被占用，dev server 无法启动。',
      recommendedFix: {
        type: 'manual',
        title: '释放端口或换端口',
        description: '运行 lsof -i :3000 查看占用进程，kill 后重启，或用 -p 指定其他端口',
        content: `# 查找占用端口的进程
lsof -i :3000

# 杀掉进程
kill -9 <PID>

# 或者换端口启动
npx next dev -p 3001`,
      },
      confidence: 'high',
      evidenceSummary: portError,
    }
  },
})

registerRule({
  id: 'webpack_error',
  name: 'Webpack 构建错误',
  evaluate(evidence) {
    const webpackError = evidence.terminal.errors.find(e =>
      /Module build failed|webpack|You may need an appropriate loader/i.test(e)
    )
    if (!webpackError) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: 'Webpack 构建失败。可能是 loader 配置问题或不支持的语法。',
      recommendedFix: {
        type: 'manual',
        title: '修复 Webpack 构建错误',
        description: '1. 检查是否缺少 loader（如 sass-loader、file-loader）\n2. 检查 tsconfig.json 配置\n3. 尝试删除 node_modules 重新安装',
        content: `# 清除缓存重试
rm -rf node_modules .next
npm install
npm run dev`,
      },
      confidence: 'medium',
      evidenceSummary: webpackError,
    }
  },
})

registerRule({
  id: 'turbopack_error',
  name: 'Turbopack 兼容问题',
  evaluate(evidence) {
    const turboError = evidence.terminal.errors.find(e =>
      /Turbopack|turbo.*error|TURBO.*NOT/i.test(e)
    )
    if (!turboError) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: 'Turbopack 兼容性问题。某些依赖或语法可能不被 Turbopack 支持。',
      recommendedFix: {
        type: 'manual',
        title: '禁用 Turbopack',
        description: '移除 --turbo 标志，使用标准 Webpack 构建',
        content: `# 不使用 Turbopack
npx next dev

# 而不是
npx next dev --turbo`,
      },
      confidence: 'medium',
      evidenceSummary: turboError,
    }
  },
})

// ═══════════════════════════════════════
// 新增 L2 网络规则（5 条）
// ═══════════════════════════════════════

registerRule({
  id: 'not_found_404',
  name: 'API 路由 404',
  evaluate(evidence) {
    const issue = evidence.network.find(e =>
      e.status === 404 && (e.url.includes('/api/') || e.url.includes('/rest/v1/'))
    )
    if (!issue) return null

    const isApiRoute = issue.url.includes('/api/')
    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: `API 路由不存在: ${issue.url}`,
      recommendedFix: {
        type: 'manual',
        title: isApiRoute ? '检查 API Route 文件路径' : '检查 Supabase 表名',
        description: isApiRoute
          ? 'Next.js App Router 的 API 路由需要在 app/api/xxx/route.ts 中定义'
          : '检查 Supabase 中表名是否正确，RLS 是否允许访问',
      },
      confidence: 'high',
      evidenceSummary: `${issue.method} ${issue.url} → 404`,
    }
  },
})

registerRule({
  id: 'rate_limited',
  name: '请求限流',
  evaluate(evidence) {
    const issue = evidence.network.find(e => e.status === 429)
    if (!issue) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: `请求被限流: ${issue.url}`,
      recommendedFix: {
        type: 'code_change',
        title: '添加请求缓存或降低频率',
        description: '1. 添加客户端缓存（SWR/React Query）\n2. 降低请求频率\n3. 检查是否有循环请求',
      },
      confidence: 'high',
      evidenceSummary: `${issue.method} ${issue.url} → 429`,
    }
  },
})

registerRule({
  id: 'payload_too_large',
  name: '请求体过大',
  evaluate(evidence) {
    const issue = evidence.network.find(e => e.status === 413)
    if (!issue) return null

    return {
      rootCause: 'api_error',
      severity: 'warning',
      description: `请求体过大: ${issue.url}`,
      recommendedFix: {
        type: 'code_change',
        title: '增加 body size limit 或分页',
        description: 'Next.js 默认 body limit 为 1MB，需要在 route handler 中配置',
        content: `// app/api/upload/route.ts
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}`,
      },
      confidence: 'high',
      evidenceSummary: `${issue.method} ${issue.url} → 413`,
    }
  },
})

registerRule({
  id: 'gateway_error',
  name: '网关错误',
  evaluate(evidence) {
    const issue = evidence.network.find(e => [502, 503, 504].includes(e.status))
    if (!issue) return null

    const statusDesc = {
      502: 'Bad Gateway（上游服务返回无效响应）',
      503: 'Service Unavailable（服务暂时不可用）',
      504: 'Gateway Timeout（上游服务响应超时）',
    }[issue.status] || '网关错误'

    return {
      rootCause: 'network_error',
      severity: 'warning',
      description: `${statusDesc}: ${issue.url}`,
      recommendedFix: {
        type: 'manual',
        title: '检查上游服务状态',
        description: '1. 检查 Supabase/第三方服务状态页\n2. 检查网络连接\n3. 稍后重试',
      },
      confidence: 'medium',
      evidenceSummary: `${issue.method} ${issue.url} → ${issue.status}`,
    }
  },
})

registerRule({
  id: 'cors_preflight_fail',
  name: 'CORS Preflight 失败',
  evaluate(evidence) {
    const issue = evidence.network.find(e =>
      e.method === 'OPTIONS' && e.status && e.status >= 400
    )
    if (!issue) return null

    return {
      rootCause: 'network_error',
      severity: 'critical',
      description: `CORS preflight 请求失败: ${issue.url}`,
      recommendedFix: {
        type: 'code_change',
        title: '处理 OPTIONS 请求',
        description: 'API 路由需要正确响应 OPTIONS preflight 请求',
        content: `// app/api/xxx/route.ts
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}`,
      },
      confidence: 'high',
      evidenceSummary: `OPTIONS ${issue.url} → ${issue.status}`,
    }
  },
})

// ═══════════════════════════════════════
// 新增 L2 控制台规则（3 条）
// ═══════════════════════════════════════

registerRule({
  id: 'react_error',
  name: 'React 运行时错误',
  evaluate(evidence) {
    const reactError = evidence.console.find(e =>
      /React.*Error|Uncaught Error|Maximum update depth/i.test(e.text)
    )
    if (!reactError) return null

    const isMaxUpdate = /Maximum update depth/i.test(reactError.text)
    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: isMaxUpdate
        ? 'React 状态更新循环（Maximum update depth exceeded）。通常是因为在 render 中直接 setState。'
        : `React 运行时错误: ${reactError.text.slice(0, 100)}`,
      recommendedFix: {
        type: 'code_change',
        title: isMaxUpdate ? '修复状态更新循环' : '修复 React 错误',
        description: isMaxUpdate
          ? '检查 useEffect 依赖项是否正确，避免在 render 中触发 setState'
          : '检查组件 props 和 state，查看浏览器控制台完整错误栈',
      },
      confidence: 'high',
      evidenceSummary: reactError.text.slice(0, 200),
    }
  },
})

registerRule({
  id: 'unhandled_promise',
  name: '未捕获的 Promise 异常',
  evaluate(evidence) {
    const promiseError = evidence.console.find(e =>
      /UnhandledPromiseRejection|unhandled.*promise|Uncaught.*promise/i.test(e.text)
    ) || evidence.terminal.errors.find(e =>
      /UnhandledPromiseRejection|unhandled.*promise/i.test(e)
    )
    if (!promiseError) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: '异步操作抛出了未捕获的异常。需要添加 try-catch 或 .catch()。',
      recommendedFix: {
        type: 'code_change',
        title: '添加错误处理',
        description: '给异步调用添加 try-catch，或在 Promise 链末尾加 .catch()',
        content: `// 方案 1: async/await + try-catch
try {
  const data = await fetch('/api/...')
} catch (error) {
  console.error('请求失败:', error)
}

// 方案 2: Promise .catch()
fetch('/api/...')
  .then(res => res.json())
  .catch(error => console.error('请求失败:', error))`,
      },
      confidence: 'medium',
      evidenceSummary: typeof promiseError === 'string' ? promiseError : promiseError.text,
    }
  },
})

registerRule({
  id: 'deprecation_warning',
  name: 'API 废弃警告',
  evaluate(evidence) {
    const depWarning = evidence.console.find(e =>
      /deprecated|will be removed|no longer supported/i.test(e.text)
    )
    if (!depWarning) return null

    return {
      rootCause: 'code_bug',
      severity: 'info',
      description: `使用了废弃的 API: ${depWarning.text.slice(0, 100)}`,
      recommendedFix: {
        type: 'manual',
        title: '迁移到新 API',
        description: '查看警告信息中的迁移建议，更新到新版本 API',
      },
      confidence: 'low',
      evidenceSummary: depWarning.text.slice(0, 200),
    }
  },
})

// ═══════════════════════════════════════
// 扩展 L1 终端规则（4 条）
// ═══════════════════════════════════════

registerRule({
  id: 'prisma_error',
  name: 'Prisma 错误',
  evaluate(evidence) {
    const prismaError = evidence.terminal.errors.find(e =>
      /PANIC|Prisma|prisma/i.test(e)
    )
    if (!prismaError) return null

    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: 'Prisma 错误。可能是 schema 问题或数据库连接失败。',
      recommendedFix: {
        type: 'manual',
        title: '检查 Prisma 配置',
        description: '1. 运行 npx prisma validate 检查 schema\n2. 运行 npx prisma db push 同步数据库\n3. 检查 DATABASE_URL 是否正确',
      },
      confidence: 'high',
      evidenceSummary: prismaError,
    }
  },
})

registerRule({
  id: 'next_config_error',
  name: 'Next.js 配置错误',
  evaluate(evidence) {
    const configError = evidence.terminal.errors.find(e =>
      /next\.config|Invalid next/i.test(e)
    )
    if (!configError) return null

    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: 'Next.js 配置文件错误。',
      recommendedFix: {
        type: 'manual',
        title: '检查 next.config.js',
        description: '1. 检查 next.config.js 语法\n2. 确认配置选项拼写正确\n3. 参考 Next.js 文档',
      },
      confidence: 'high',
      evidenceSummary: configError,
    }
  },
})

registerRule({
  id: 'eslint_error',
  name: 'ESLint 错误',
  evaluate(evidence) {
    const eslintError = evidence.terminal.errors.find(e =>
      /ESLint|eslint/i.test(e)
    )
    if (!eslintError) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: 'ESLint 代码规范错误。',
      recommendedFix: {
        type: 'code_change',
        title: '修复 ESLint 错误',
        description: '运行 npx eslint --fix 自动修复，或手动修复错误',
        content: 'npx eslint --fix .',
      },
      confidence: 'high',
      evidenceSummary: eslintError,
    }
  },
})

registerRule({
  id: 'build_error',
  name: '构建失败',
  evaluate(evidence) {
    const buildError = evidence.terminal.errors.find(e =>
      /Build failed|Build error|compilation failed/i.test(e)
    )
    if (!buildError) return null

    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: '项目构建失败。',
      recommendedFix: {
        type: 'manual',
        title: '检查构建错误',
        description: '1. 查看完整错误日志\n2. 检查 TypeScript 类型错误\n3. 检查导入路径是否正确',
      },
      confidence: 'high',
      evidenceSummary: buildError,
    }
  },
})

// ═══════════════════════════════════════
// 扩展 L2 网络规则（3 条）
// ═══════════════════════════════════════

registerRule({
  id: 'ssl_error',
  name: 'SSL 证书错误',
  evaluate(evidence) {
    const sslError = evidence.terminal.errors.find(e =>
      /SSL|certificate|CERT_|UNABLE_TO_VERIFY/i.test(e)
    )
    if (!sslError) return null

    return {
      rootCause: 'network_error',
      severity: 'critical',
      description: 'SSL 证书验证失败。',
      recommendedFix: {
        type: 'manual',
        title: '检查 SSL 证书',
        description: '1. 检查系统时间是否正确\n2. 更新 CA 证书\n3. 如果是自签名证书，设置 NODE_TLS_REJECT_UNAUTHORIZED=0（仅开发环境）',
      },
      confidence: 'high',
      evidenceSummary: sslError,
    }
  },
})

registerRule({
  id: 'timeout_error',
  name: '请求超时',
  evaluate(evidence) {
    const timeoutError = evidence.terminal.errors.find(e =>
      /ETIMEDOUT|timeout|timed out/i.test(e)
    )
    if (!timeoutError) return null

    return {
      rootCause: 'network_error',
      severity: 'warning',
      description: '请求超时。可能是网络问题或服务端响应慢。',
      recommendedFix: {
        type: 'manual',
        title: '检查网络连接',
        description: '1. 检查网络连接是否正常\n2. 检查目标服务是否可用\n3. 增加超时时间',
      },
      confidence: 'medium',
      evidenceSummary: timeoutError,
    }
  },
})

registerRule({
  id: 'dns_error',
  name: 'DNS 解析失败',
  evaluate(evidence) {
    const dnsError = evidence.terminal.errors.find(e =>
      /ENOTFOUND|getaddrinfo|DNS/i.test(e)
    )
    if (!dnsError) return null

    return {
      rootCause: 'network_error',
      severity: 'critical',
      description: 'DNS 解析失败。域名无法解析。',
      recommendedFix: {
        type: 'manual',
        title: '检查 DNS 配置',
        description: '1. 检查域名拼写是否正确\n2. 检查 DNS 服务器配置\n3. 尝试使用其他 DNS（如 8.8.8.8）',
      },
      confidence: 'high',
      evidenceSummary: dnsError,
    }
  },
})

// ═══════════════════════════════════════
// 扩展 L2 控制台规则（3 条）
// ═══════════════════════════════════════

registerRule({
  id: 'memory_leak',
  name: '内存泄漏',
  evaluate(evidence) {
    const memoryError = evidence.console.find(e =>
      /heap|out of memory|FATAL ERROR/i.test(e.text)
    ) || evidence.terminal.errors.find(e =>
      /heap|out of memory|FATAL ERROR/i.test(e)
    )
    if (!memoryError) return null

    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: '内存溢出。可能是内存泄漏或数据量过大。',
      recommendedFix: {
        type: 'code_change',
        title: '检查内存使用',
        description: '1. 检查是否有未清理的事件监听器\n2. 检查是否有未取消的订阅\n3. 使用 --max-old-space-size 增加内存限制',
        content: 'node --max-old-space-size=4096 your-script.js',
      },
      confidence: 'high',
      evidenceSummary: typeof memoryError === 'string' ? memoryError : memoryError.text,
    }
  },
})

registerRule({
  id: 'infinite_loop',
  name: '无限递归',
  evaluate(evidence) {
    const stackError = evidence.console.find(e =>
      /Maximum call stack|RangeError/i.test(e.text)
    ) || evidence.terminal.errors.find(e =>
      /Maximum call stack|RangeError/i.test(e)
    )
    if (!stackError) return null

    return {
      rootCause: 'code_bug',
      severity: 'critical',
      description: '无限递归或循环。调用栈溢出。',
      recommendedFix: {
        type: 'code_change',
        title: '检查递归逻辑',
        description: '1. 检查递归函数是否有终止条件\n2. 检查循环是否有退出条件\n3. 检查是否有相互引用导致的循环',
      },
      confidence: 'high',
      evidenceSummary: typeof stackError === 'string' ? stackError : stackError.text,
    }
  },
})

registerRule({
  id: 'dom_error',
  name: 'DOM 操作错误',
  evaluate(evidence) {
    const domError = evidence.console.find(e =>
      /NotFoundError|HierarchyRequestError|InvalidStateError/i.test(e.text)
    )
    if (!domError) return null

    return {
      rootCause: 'code_bug',
      severity: 'warning',
      description: 'DOM 操作错误。尝试操作不存在或不合法的 DOM 节点。',
      recommendedFix: {
        type: 'code_change',
        title: '检查 DOM 操作',
        description: '1. 检查元素是否存在\n2. 检查 React 组件是否正确卸载\n3. 使用 useRef 安全访问 DOM',
      },
      confidence: 'medium',
      evidenceSummary: domError.text.slice(0, 200),
    }
  },
})

export default rules
