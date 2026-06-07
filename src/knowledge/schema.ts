/**
 * 问题知识库数据结构
 * 护城河：每修一个 bug 沉淀「栈+症状+根因+修复+重验是否通过」，复利增长
 */

/** 技术栈指纹 */
export interface StackFingerprint {
  framework: string
  frameworkVersion: string
  /** @deprecated 使用 databases 字段代替 */
  hasSupabase: boolean
  /** 检测到的数据库列表 */
  databases?: string[]
  deployTarget: string
}

/** 症状指纹 — 用于匹配相似问题 */
export interface SymptomFingerprint {
  /** 错误类型（如 rls_denied, auth_error） */
  errorType: string
  /** 错误码（如 42501） */
  errorCode: string | null
  /** 涉及的表名 */
  tableName: string | null
  /** 涉及的 HTTP 方法 */
  httpMethod: string | null
  /** 关键词（从错误信息中提取） */
  keywords: string[]
}

/** 知识库条目 */
export interface KnowledgeEntry {
  /** 唯一 ID */
  id: string
  /** 创建时间 */
  createdAt: string
  /** 最后使用时间 */
  lastUsedAt: string
  /** 使用次数 */
  useCount: number
  /** 技术栈 */
  stack: StackFingerprint
  /** 症状指纹 */
  symptom: SymptomFingerprint
  /** 根因描述 */
  rootCause: string
  /** 根因类型 */
  rootCauseType: string
  /** 修复方案 */
  fix: {
    type: string
    title: string
    description: string
    content: string | null
  }
  /** 重验结果 */
  verified: boolean | null
  /** 标签（便于搜索） */
  tags: string[]
  /** 备注 */
  notes: string
}

/** 知识库查询条件 */
export interface KnowledgeQuery {
  /** 按错误类型过滤 */
  errorType?: string
  /** 按错误码过滤 */
  errorCode?: string
  /** 按表名过滤 */
  tableName?: string
  /** 按框架过滤 */
  framework?: string
  /** 按关键词搜索 */
  keywords?: string[]
  /** 返回数量限制 */
  limit?: number
}
