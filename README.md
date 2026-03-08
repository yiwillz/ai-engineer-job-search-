# Agentic Job Scout

Chrome 扩展（Manifest V3），自动从 LinkedIn、Indeed、Boss直聘 收集 AI 工程师校招/实习岗位，经 LLM 过滤与结构化后导出为 CSV。

---

## 功能

- **多平台搜索**：LinkedIn、Indeed、Boss直聘，可单独勾选
- **LLM 智能过滤**：调用 OpenAI / DeepSeek API 判断岗位是否为 AI 工程师方向（校招/实习），并提取结构化信息
- **断点续跑**：Stop 暂停，再点 Start Agent 从中断处继续，不丢失已收集数据
- **自动去重**：URL 去重 + 标题/公司二次去重，避免同一岗位多地点重复入库
- **防无限循环**：连续重复 URL 达上限或翻页超过最大页数时自动切换关键词
- **登录墙检测**：遇到登录/验证页面自动跳过当前平台
- **CSV 导出**：达到目标数量（默认 50）后自动触发下载；也可随时手动导出
- **数据重置**：「重置」按钮清空 IndexedDB 和所有任务状态

---

## 输出字段

| 字段 | 说明 |
|------|------|
| `title` | 职位名称 |
| `company` | 公司名称 |
| `location` | 工作地点 |
| `salary` | 薪资（若有） |
| `tech_tags` | 技术标签，如 `LLM`, `NLP`, `CV` |
| `requirements` | LLM 提炼的核心技能要求 |
| `source` | 来源平台（LinkedIn / Indeed / Boss直聘） |
| `job_url` | 岗位链接 |

---

## 技术栈

- **构建**：Vite + @crxjs/vite-plugin（MV3）
- **UI**：React + TailwindCSS
- **LLM**：兼容 OpenAI API 格式（OpenAI / DeepSeek）
- **校验**：Zod（验证 LLM JSON 输出）
- **存储**：`chrome.storage.local`（任务状态）+ IndexedDB / `idb`（岗位数据）
- **语言**：TypeScript

---

## 项目结构

```
src/
├── popup/
│   ├── App.tsx          # 插件弹窗 UI
│   └── index.css
├── background/
│   ├── background.ts          # 消息路由（Service Worker）
│   ├── agentOrchestrator.ts   # 状态机主循环
│   └── llmClient.ts           # LLM 调用 + Zod 校验
├── content_script/
│   ├── content.ts             # 按域名分发到各 Adapter
│   └── adapters/
│       ├── SiteAdapter.ts     # 接口定义
│       ├── LinkedInAdapter.ts
│       ├── IndeedAdapter.ts
│       └── BossAdapter.ts
└── shared/
    ├── types.ts               # 共享类型（JobData, TaskState, Message）
    └── storageUtils.ts        # chrome.storage + IndexedDB 工具函数
```

---

## 安装与使用

### 1. 构建扩展

```bash
npm install
npm run build
```

生成产物在 `dist/` 目录。

### 2. 加载到 Chrome

1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `dist/` 目录

### 3. 配置

点击扩展图标，填写：

| 配置项 | 说明 |
|--------|------|
| Model | 选择 GPT-4o mini / GPT-4o / DeepSeek Chat / 自定义 |
| API Base URL | 自定义模型时填写接口地址 |
| API Key | 对应平台的 API Key |
| Target Role | 目标岗位描述（默认 `AI Engineer 校招/实习`） |
| Search Platforms | 勾选要搜索的平台 |

### 4. 使用流程

1. 打开任意一个招聘网站标签页（LinkedIn / Indeed / Boss直聘）
2. 点击「Start Agent」—— 扩展立即接管该标签页开始搜索
3. 需要暂停时点「Stop」，再点「Start Agent」从断点继续
4. 收集满 50 条后自动下载 CSV，或随时点「CSV」手动导出
5. 开始全新收集前点「重置」清空数据

---

## 平台注意事项

| 平台 | 要求 |
|------|------|
| LinkedIn | 需要登录；中国用户需开启 VPN（支持 linkedin.cn） |
| Indeed | 需要 VPN |
| Boss直聘 | 需要登录；**关闭 VPN** 使用（VPN 会被拦截） |

---

## 架构要点

- **Service Worker 无状态**：所有任务状态持久化到 `chrome.storage.local`，SW 休眠/唤醒后可无缝恢复
- **Content Script 只提取原始文本**，语义解析全部交给 LLM
- **Strategy 模式**：`SiteAdapter` 接口统一 LinkedIn / Indeed / Boss直聘 的链接提取与详情抓取逻辑
- **API Key 仅在 Background 中使用**，不暴露给 Content Script
- **Stop 竞态保护**：每个 async handler 在 await 点后重读 TaskState，确保 Stop 指令能立即生效
- **断点续跑**：Start Agent 检测到已有进度时直接 Resume，不重置计数器

---

## 开发

```bash
npm run dev    # 监听模式构建（配合 Chrome 扩展热重载）
npm run build  # 生产构建
```
