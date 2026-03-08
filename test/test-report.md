# 测试报告 — Agentic Job Scout

**测试时间**：2026-03-08
**测试框架**：Vitest v4.0.18 + jsdom
**运行命令**：`npm test`
**结果：77 / 77 通过，0 失败**

---

## 无用文件检查

| 检查项 | 结果 |
|--------|------|
| Python 残留文件（`.py`, `__pycache__`） | 无 |
| 未引用的 JS/TS 文件 | 无 |
| 重复/冗余的配置文件 | 无 |
| `node_modules` 被 `.gitignore` 排除 | ✓ |
| `dist/` 被 `.gitignore` 排除 | ✓ |
| `plan/` 文件夹内容 | 仅规划文档（docx/pdf），非代码，保留合理 |

**结论**：项目无冗余文件，`.gitignore` 已从 Python 模板替换为 Node.js/TS 专用版本。

---

## 自动化测试结果

### 总览

| 测试文件 | 测试数 | 通过 | 失败 |
|---------|--------|------|------|
| `csv.test.ts` | 11 | 11 | 0 |
| `types.test.ts` | 18 | 18 | 0 |
| `zod.test.ts` | 15 | 15 | 0 |
| `url.test.ts` | 22 | 22 | 0 |
| `storage.test.ts` | 11 | 11 | 0 |
| **合计** | **77** | **77** | **0** |

---

### csv.test.ts — CSV 生成逻辑（11项）

测试 `jobsToCSV()` 函数的正确性：

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | 输出正确 CSV 表头（8列） | ✓ |
| 2 | 空数组只输出表头行 | ✓ |
| 3 | 单条数据输出 2 行（表头+数据） | ✓ |
| 4 | 所有字段用双引号包裹 | ✓ |
| 5 | tech_tags 数组用 "; " 连接 | ✓ |
| 6 | 空 salary 输出空引号字段 `""` | ✓ |
| 7 | 字段内双引号转义为 `""` | ✓ |
| 8 | 字段内逗号被引号包裹（不破坏 CSV 结构） | ✓ |
| 9 | N 条数据输出 N+1 行 | ✓ |
| 10 | `job_url` 位于最后一列 | ✓ |
| 11 | `source` 位于倒数第二列 | ✓ |

---

### types.test.ts — 类型定义与默认值（18项）

测试 `DEFAULT_TASK_STATE`、`DEFAULT_USER_CONFIG`、`JobData` 和 `MessageType` 的正确性：

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | `status` 初始值为 `'idle'` | ✓ |
| 2 | `target` 默认为 50 | ✓ |
| 3 | `collected` 初始为 0 | ✓ |
| 4 | `visitedUrls` 初始为空数组 | ✓ |
| 5 | `pendingLinks` 初始为空数组 | ✓ |
| 6 | `currentKeywordIndex` 初始为 0 | ✓ |
| 7 | `currentPage` 初始为 1 | ✓ |
| 8 | `maxPagesPerKeyword` 默认为 10 | ✓ |
| 9 | `consecutiveDupes` 初始为 0 | ✓ |
| 10 | `currentPlatformIndex` 初始为 0 | ✓ |
| 11 | `activeTabId` 初始为 null | ✓ |
| 12 | `savedJobKeys` 初始为空数组 | ✓ |
| 13 | `selectedPlatformIndices` 默认选中所有平台 `[0,1,2]` | ✓ |
| 14 | `DEFAULT_TASK_STATE` 包含所有必需字段（15个） | ✓ |
| 15 | `DEFAULT_USER_CONFIG.apiKey` 初始为空字符串 | ✓ |
| 16 | `DEFAULT_USER_CONFIG.apiBaseUrl` 指向 OpenAI | ✓ |
| 17 | `DEFAULT_USER_CONFIG.model` 默认为 `gpt-4o-mini` | ✓ |
| 18 | `MessageType` 包含全部 10 个消息类型 | ✓ |

---

### zod.test.ts — LLM 响应 Schema 校验（15项）

验证 `JobExtractionSchema`（复现自 `llmClient.ts`）对各类 LLM 输出的校验行为：

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | 合法 AI 工程师岗位响应通过校验 | ✓ |
| 2 | `is_ai_engineer=false` 的响应也能通过 Schema（由后续逻辑过滤） | ✓ |
| 3 | `tech_tags` 为空数组时通过 | ✓ |
| 4 | `salary` 为空字符串时通过 | ✓ |
| 5 | 缺少 `is_ai_engineer` 字段时拒绝 | ✓ |
| 6 | 缺少 `is_campus_or_intern` 字段时拒绝 | ✓ |
| 7 | `is_ai_engineer` 为字符串 `"true"` 时拒绝（类型错误） | ✓ |
| 8 | `tech_tags` 为字符串而非数组时拒绝 | ✓ |
| 9 | `tech_tags` 数组含非字符串元素时拒绝 | ✓ |
| 10 | `null` 响应被拒绝 | ✓ |
| 11 | 空对象 `{}` 被拒绝 | ✓ |
| 12 | 缺少 `title` 字段时拒绝 | ✓ |
| 13 | `is_ai_engineer=false` → 资格判断为 false（不保存） | ✓ |
| 14 | `is_campus_or_intern=false` → 资格判断为 false（不保存） | ✓ |
| 15 | 两个标志均为 true → 资格判断为 true（保存） | ✓ |

---

### url.test.ts — 平台 URL 构建逻辑（22项）

验证三平台 URL 构建函数的参数正确性：

**LinkedIn（7项）**

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | 使用正确基础 URL | ✓ |
| 2 | 关键词 URL 编码（空格→`%20`） | ✓ |
| 3 | 包含经验筛选 `f_E=1%2C2`（实习+入门级） | ✓ |
| 4 | 包含 90 天时间过滤 `f_TPR=r7776000` | ✓ |
| 5 | 第 1 页 → `start=0` | ✓ |
| 6 | 第 2 页 → `start=25` | ✓ |
| 7 | 第 3 页 → `start=50` | ✓ |

**Indeed（6项）**

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | 使用正确基础 URL | ✓ |
| 2 | 关键词 URL 编码 | ✓ |
| 3 | 包含 90 天过滤 `fromage=90` | ✓ |
| 4 | 第 1 页 → `start=0` | ✓ |
| 5 | 第 2 页 → `start=10` | ✓ |
| 6 | 第 4 页 → `start=30` | ✓ |

**Boss直聘（7项）**

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | 使用正确基础 URL | ✓ |
| 2 | 中文关键词正确编码 | ✓ |
| 3 | 包含全国城市 `city=100010000` | ✓ |
| 4 | 包含近1个月过滤 `publishTime=3` | ✓ |
| 5 | 包含毕业生经验过滤 `experience=101%2C102` | ✓ |
| 6 | 使用 `page=N` 参数翻页 | ✓ |
| 7 | 不使用 `start=` 参数（与 LinkedIn/Indeed 区分） | ✓ |

**跨平台对比（2项）**

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | LinkedIn 每页 25 条（start 跳 25） | ✓ |
| 2 | Indeed 每页 10 条（start 跳 10） | ✓ |

---

### storage.test.ts — Chrome Storage 读写（11项）

使用 vi.mock 模拟 Chrome API，测试 `getTaskState`、`updateTaskState`、`resetTaskState`：

| # | 测试用例 | 结果 |
|---|---------|------|
| 1 | Storage 为空时返回 `DEFAULT_TASK_STATE` | ✓ |
| 2 | 旧版存储（缺少新字段）与 DEFAULT 合并后完整 | ✓ |
| 3 | Storage 返回 undefined 不抛异常 | ✓ |
| 4 | 局部更新正确合并到当前状态 | ✓ |
| 5 | 更新后 `lastUpdated` 时间戳更新 | ✓ |
| 6 | `updateTaskState` 调用 `chrome.storage.local.set` | ✓ |
| 7 | `resetTaskState` 写入默认 `status=idle` | ✓ |
| 8 | `resetTaskState` 写入 `collected=0` | ✓ |
| 9 | `resetTaskState` 写入空 `visitedUrls` | ✓ |
| 10 | `resetTaskState` 写入空 `pendingLinks` | ✓ |
| 11 | Chrome API mock 在每个测试间正确重置 | ✓ |

---

## 无法自动化的测试项（需手动验证）

以下功能依赖真实浏览器环境，无法在 Node.js 中自动化：

| 类别 | 测试项 | 验证方法 |
|------|--------|---------|
| **DOM 提取** | LinkedInAdapter 正确提取岗位链接 | 打开 LinkedIn 搜索页，观察 `[content] Found X links` 日志 |
| **DOM 提取** | IndeedAdapter 正确提取岗位链接 | 打开 Indeed 搜索页，观察 LINKS_RESULT |
| **DOM 提取** | BossAdapter 正确处理 SPA 懒加载 | 打开 Boss直聘 搜索页，确认链接数 > 0 |
| **LLM 过滤** | AI 工程师岗位被正确收录 | 查看收集结果，验证无 AI测试/生图师等误判 |
| **LLM 过滤** | 非 AI 岗位被正确过滤 | 同上 |
| **Stop 竞态** | 点击 Stop 后 agent 在 1-2 步内停止 | 点击 Stop，观察页面停止跳转 |
| **Resume** | Stop 后 Start 从断点继续 | 进度显示不归零，从上次位置继续 |
| **CSV 导出** | 下载的 CSV 可被 Excel/Sheets 正确打开 | 打开 CSV 文件，验证列对齐 |
| **登录墙** | LinkedIn 未登录时跳过该平台 | 退出 LinkedIn 账号后测试 |
| **Badge** | 插件图标显示进度数字 | 直观观察图标 |

---

## 构建验证

```
npm run build → ✓ 成功，无 TypeScript 错误
构建产物：dist/ 目录
  background.ts bundle:  70.85 kB（gzip: 18.84 kB）
  content.ts bundle:      7.74 kB（gzip:  2.40 kB）
  popup bundle:         150.40 kB（gzip: 48.41 kB）
```

---

## 总结

| 检查项 | 状态 |
|--------|------|
| 无冗余文件 | ✓ |
| TypeScript 编译无错误 | ✓ |
| CSV 生成逻辑正确 | ✓ |
| 类型定义与默认值完整 | ✓ |
| LLM 响应 Schema 校验正确 | ✓ |
| 三平台 URL 参数全部正确 | ✓ |
| Chrome Storage 读写逻辑正确 | ✓ |
| 自动化测试 77/77 全部通过 | ✓ |
