# 贡献指南

感谢你对 Bugfixer Agent 的兴趣！🎉

## 如何贡献

### 报告 Bug

使用 [Bug 报告模板](https://github.com/wjyxiaojiu-del/bugfixer-agent/issues/new?template=bug_report.md) 提交 Issue。

请包含：
- 你的操作系统和 Node.js 版本
- 项目的技术栈（框架、数据库）
- 完整的错误信息
- 复现步骤

### 提交功能请求

使用 [功能请求模板](https://github.com/wjyxiaojiu-del/bugfixer-agent/issues/new?template=feature_request.md) 提交 Issue。

### 提交代码

1. Fork 本仓库
2. 创建你的分支：`git checkout -b feature/my-feature`
3. 提交你的修改：`git commit -m 'feat: add my feature'`
4. 推送到分支：`git push origin feature/my-feature`
5. 提交 Pull Request

## 开发环境

```bash
# 克隆你的 fork
git clone https://github.com/your-username/bugfixer-agent.git
cd bugfixer-agent

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 运行测试
npm run test

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 代码规范

- 使用 TypeScript
- 使用 ESM（`import/export`）
- 使用 `.js` 扩展名（即使源文件是 `.ts`）
- 使用 `chalk` 输出彩色文本
- 使用 `async/await` 处理异步

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>

feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

## 添加新诊断规则

1. 在 `src/diagnose/rules.ts` 中添加规则：

```typescript
registerRule({
  id: 'my_rule',
  name: '我的规则',
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

2. 在 `test/diagnose/rules-extended.test.ts` 中添加测试
3. 运行 `npm run test` 确保测试通过

## 添加新数据库支持

1. 在 `src/evidence/l3/` 中创建新的 provider 文件
2. 实现 `DatabaseProvider` 接口
3. 在 `src/stack/detect.ts` 中注册 provider
4. 在 `src/diagnose/rules.ts` 中添加诊断规则
5. 添加测试和 fixture

## License

提交代码即表示你同意你的代码以 MIT 协议发布。
