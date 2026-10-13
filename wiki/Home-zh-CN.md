# hexo-blog-encrypt

[English](Home)

> 在构建时加密单篇 Hexo 博客文章. 读者输入密码, 通过 Web Crypto API 在浏览器端解密. 无需服务端. 构建完成后磁盘上不留明文.

[**🔗 在线演示**](https://d0n9x1n.github.io/hexo-blog-encrypt/) · [**📦 npm**](https://www.npmjs.com/package/hexo-blog-encrypt) · [**📝 源码**](https://github.com/D0n9X1n/hexo-blog-encrypt) · [**📋 Releases**](https://github.com/D0n9X1n/hexo-blog-encrypt/releases)

---

## v4 提供什么

| | |
|---|---|
| **密码学** | PBKDF2-SHA256 派生密钥 + **AES-256-GCM** 认证加密 (服务端用 Node.js `crypto`, 浏览器用 Web Crypto). GCM 认证标签可以检测密文篡改, 无需额外的 HMAC. |
| **每篇文章独立的 salt + nonce** | 每篇加密文章都有新的 32 字节 salt 和 12 字节 nonce. 内容和密码完全相同的两篇文章也会得到不同的密文. |
| **8 个主题** | `default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray`, 见[主题展示](Themes-zh-CN). |
| **可选的解密按钮** | 在密码框旁显示一个点击即可解密的按钮. 按钮文字可配置. |
| **可选的 `autoSave`** | 默认关闭. 开启后把派生出的密钥缓存在 `localStorage` 中, 刷新页面时无需再次输入. |
| **可选的 `stableSalt`** | 默认关闭. 从文章永久链接派生 salt, 使其在干净重建后保持不变, 从而让 `autoSave` 缓存在 Cloudflare Pages / Vercel / Netlify / GitHub Actions 上保持有效. nonce 仍是随机的. 见[安全模型](Security-Model-zh-CN). |
| **按标签加密** | 在 `_config.yml` 中定义 `{name, password}` 列表; 带有匹配标签的文章会用列表中的密码加密. |
| **解密回调** | `window.addEventListener('hexo-blog-decrypt', fn)`: 文章显示后重新初始化 MathJax / hljs / 目录 (TOC) 等. |
| **完整测试** | 在 Node 18–26 和 Hexo 7/8 上服务端覆盖率 100 %, 并在 Chromium, Firefox 和 WebKit 上对全部 8 个主题运行 Playwright 端到端测试. |

---

## 选择你的路径

**第一次使用?** → [入门指南](Getting-Started-zh-CN): 60 秒完成安装和第一篇加密文章.

**从 v3 升级?** → [从 v3 迁移到 v4](Migration-v3-to-v4-zh-CN): 改了什么, 为什么改.

**查找配置项?** → [配置参考](Configuration-Reference-zh-CN): 每个配置项及其默认值.

**想要自定义外观?** → [主题](Themes-zh-CN): 8 个内置主题, 以及如何编写自己的主题.

**文章中嵌入了 JS / MathJax / hljs?** → [回调与 MathJax](Callbacks-and-MathJax-zh-CN): `hexo-blog-decrypt` 事件及完整示例.

**想按标签而不是逐篇加密?** → [按标签加密](Tag-Based-Encryption-zh-CN).

**这到底有多安全?** → [安全模型](Security-Model-zh-CN): 哪些受保护, 哪些不受保护.

**解密无声无息地失败?** → [浏览器支持](Browser-Support-zh-CN) 和 [故障排查](Troubleshooting-zh-CN).

**有问题?** → [常见问题](FAQ-zh-CN).

**加密文章的目录 (TOC) 为空或泄露了标题?** → [加密文章目录](Encrypted-TOC-zh-CN).

## 维护者

- [架构](Architecture-zh-CN): 模块, 数据格式, 关键文件.
- [开发](Development-zh-CN): 环境搭建, 测试命令, 工作流规则.
- [编写主题](Theme-Authoring-zh-CN): 单文件主题约定.
- [发布流程](Release-Process-zh-CN): 由标签驱动的 npm 和 GitHub Packages 发布.
- [Wiki 发布](Wiki-Publication-zh-CN): 本 wiki 如何编写, 检查和发布.

---

## 60 秒上手

```yaml
# _config.yml
encrypt:
  abstract: 'This post is locked.'
  message: 'Password required.'
  theme: default
```

```markdown
---
title: My Diary
date: 2024-01-01
password: hello
---

Only the holder of the password "hello" can read this.

<!-- more -->

The secret is...
```

```bash
hexo clean && hexo generate
```

打开文章 → 出现密码提示 → 输入 `hello` → 点击 **Decrypt** → 内容显示.

---

## 许可

MIT. 见 [LICENSE](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/LICENSE).
