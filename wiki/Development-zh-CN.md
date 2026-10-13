# 开发

[English](Development)

如何参与本项目开发: 环境搭建, 测试命令和基本工作流程规则.

## 环境搭建 (新克隆之后)

```sh
npm install
```

就这样. 没有子模块, 没有额外步骤.

## 测试命令

| 命令 | 运行内容 |
| --- | --- |
| `npm test` | Lint + 服务端测试 (`tests/server/*.test.js`, `tests/docs.test.js`) + 针对全部 8 个主题的 Playwright e2e. 即 CI 运行的完整测试套件. |
| `npm run lint` | ESLint (flat config, `eslint.config.js`), 检查除 `demo/` 和构建产物之外的整个仓库. |
| `npm run test:server` | 只运行服务端 Node 测试. 速度快 (不需要浏览器). |
| `npm run test:e2e` | 只运行 Playwright e2e. 对 `tests/fixtures/hexo-site/` 做一次真实的 Hexo 构建, 启动服务, 驱动 Chromium, Firefox 和 WebKit (用 `--project=chromium` 只运行一个). |
| `npm run build` | 通过 esbuild 重新构建浏览器端 bundle (`lib/hbe.bundle.js`). 作为 `prepack` 在 `npm publish` 之前自动运行. |

推送任何涉及 `src/`, `lib/` 或 `tests/` 的改动之前, 先运行 `npm test`.
CI 会拒绝回归; 先在本地运行能在几秒内发现问题.

## 工作流程基础

- **先有失败的测试, 才写生产代码.** 先添加测试,
  看它失败, 再让它通过.
- **修复根本原因.** 不要掩盖症状; 打补丁之前先弄清楚
  问题为什么出现.
- **确认后再宣布完成.** 每次改动后都重新运行相关测试.
- **向后兼容.** 新配置项必须有安全的默认值.
  已发布的加密文章必须仍能被新 bundle 解密,
  否则数据格式字节 (`data-hbe-format`) 必须与 bundle
  同步升级.

## 分支保护

`Tests` 工作流运行 `lint-and-server` 和分片的 `e2e` 任务. 所有任务都必须
通过才能合并或发布.

| 任务 | 矩阵 |
| --- | --- |
| `lint-and-server` | Node 18, 20, 22, 24, 26 搭配 Hexo 7 fixture, 外加 Node 24 搭配 Hexo 8. Lint 只运行一次 (Node 22). Node 18 运行不带覆盖率门禁的普通 `node --test`, 因为 c8 和 ESLint 需要 Node 20.19+. |
| `e2e` | Chromium, Firefox 和 WebKit 针对 Hexo 7 fixture, 外加 Chromium 针对 Hexo 8; 每个各分两个分片. |

CI 使用已提交的 `package-lock.json`, 通过 `npm ci` 安装根目录依赖.
fixture 站点没有 lockfile: CI 在 `npm install` 之前把它的 `hexo` 依赖设为
矩阵中的主版本. 仓库的分支保护设置可能有所不同;
必需检查的分阶段启用流程记录在
[`.github/CONTRIBUTING.md`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/.github/CONTRIBUTING.md) 中.

CODEOWNERS (`.github/CODEOWNERS`) 将 `@D0n9X1n` 设为每个 PR 的
默认审查者.

## 新增主题

参见 [主题开发](Theme-Authoring-zh-CN). 只需放入一个文件, 无需修改
`src/server/` 或 `src/browser/`.

## 发布版本

参见 [发布流程](Release-Process-zh-CN). 发布前检查清单 + 打 tag
流程 + GH Packages 镜像 + 故障排查都在同一处.

## 另请参阅

- [架构](Architecture-zh-CN): 代码库导览.
- [发布流程](Release-Process-zh-CN): 发布步骤.
- [主题开发](Theme-Authoring-zh-CN): 主题约定.
- [`.github/CONTRIBUTING.md`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/.github/CONTRIBUTING.md): 贡献者
  指南 + 分支保护启用流程.
