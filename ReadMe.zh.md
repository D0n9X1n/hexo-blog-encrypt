# hexo-blog-encrypt

> 为单篇 Hexo 文章设置密码. 构建时使用 AES-256-GCM 加密, 读者在浏览器中通过
> Web Crypto API 解密. 无需服务端, 生成的 HTML 中不含明文.

**[▶ 在线演示](https://d0n9x1n.github.io/hexo-blog-encrypt/)**: 所有演示密码都是 `hello`.

[![GitHub release](https://img.shields.io/github/v/release/D0n9X1n/hexo-blog-encrypt?include_prereleases&logo=github&label=release&color=brightgreen)](https://github.com/D0n9X1n/hexo-blog-encrypt/releases)
[![npm](https://img.shields.io/npm/v/hexo-blog-encrypt?logo=npm&color=brightgreen)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![npm downloads](https://img.shields.io/npm/dm/hexo-blog-encrypt?logo=npm&label=downloads)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![License](https://img.shields.io/npm/l/hexo-blog-encrypt?color=brightgreen)](./LICENSE)
[![Tests](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/badge/server%20coverage-100%25-brightgreen)](./docs/DEVELOPMENT.md)
[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen?logo=github)](https://d0n9x1n.github.io/hexo-blog-encrypt/)
[![Node](https://img.shields.io/node/v/hexo-blog-encrypt?logo=node.js&color=brightgreen)](./package.json)
[![Hexo](https://img.shields.io/npm/dependency-version/hexo-blog-encrypt/peer/hexo?logo=hexo&label=hexo)](https://hexo.io/)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](./package.json)
[![npm provenance](https://img.shields.io/badge/npm-provenance-blue?logo=npm)](https://www.npmjs.com/package/hexo-blog-encrypt#provenance)
[![GitHub stars](https://img.shields.io/github/stars/D0n9X1n/hexo-blog-encrypt?style=flat&logo=github)](https://github.com/D0n9X1n/hexo-blog-encrypt/stargazers)

[English](./ReadMe.md) · 中文说明 · [Wiki](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki) · [更新日志](./CHANGELOG.md)

## 目录

- [主要特性](#主要特性)
- [在线演示](#在线演示)
- [安装](#安装)
- [快速开始](#快速开始)
- [配置](#配置)
- [主题集成](#主题集成)
- [浏览器支持](#浏览器支持)
- [为什么要从 v3 升级](#为什么要从-v3-升级)
- [从 v3 升级](#从-v3-升级)
- [参与贡献](#参与贡献)
- [许可](#许可)

## 主要特性

| | |
| --- | --- |
| **认证加密** | [PBKDF2](https://www.rfc-editor.org/rfc/rfc8018)-SHA256 派生密钥, [AES-256-GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final) 加密. GCM 认证标签会拒绝错误密码和被篡改的密文. |
| **只用原生密码学 API** | 构建时使用 Node.js [`crypto`](https://nodejs.org/api/crypto.html), 阅读时使用浏览器 [Web Crypto API](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Crypto_API). 没有运行时依赖. |
| **每篇文章独立密钥** | 每篇文章都有独立的 32 字节 salt 和 12 字节 nonce, 破解一篇不会加速对其它文章的攻击. |
| **文章密码或标签密码** | 在文章信息头写 `password:`, 或在 `_config.yml` 中为标签配置密码. |
| **8 个主题** | `default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray`. 放入一个 HTML 文件即可新增主题. |
| **脚本照常运行** | 解密后文章中的脚本按文档顺序执行. 文章显示后触发 `hexo-blog-decrypt` 事件. |
| **默认保护隐私** | 除非用 `autoSave` 开启, 否则不保存密码或密钥. |
| **完整测试** | 服务端 100% 行 / 分支 / 函数覆盖, 并用 Playwright 对每个主题做端到端测试. |

## 在线演示

打开 **[演示站点](https://d0n9x1n.github.io/hexo-blog-encrypt/)**, 所有密码都是 `hello`.

- [主题展示](https://d0n9x1n.github.io/hexo-blog-encrypt/tags/theme-demo/)
- [解密回调](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/callback/)
- [脚本加载顺序与缓存密钥](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/script-order/)

## 安装

```bash
npm install --save hexo-blog-encrypt
```

需要 Node.js 18 及以上, Hexo 5 及以上. npm 包带有
[provenance](https://docs.npmjs.com/generating-provenance-statements) 证明,
并镜像发布到 GitHub Packages (`@d0n9x1n/hexo-blog-encrypt`).

## 快速开始

在文章信息头中加入 `password`:

```markdown
---
title: Hello World
date: 2016-03-30 21:18:02
password: hello
---
```

然后重新生成并预览:

```bash
hexo clean && hexo generate && hexo server
```

文章正文会被替换为密码输入框. 首页等列表页显示 `abstract` 文本, 而不是正文.

## 配置

配置按以下顺序生效:

**文章信息头 > `_config.yml` 中的 `encrypt:` > 内置默认值**

文章信息头中的 `password` 优先于标签密码.

### 文章信息头

```markdown
---
title: Hello World
tags:
- 作为日记加密
date: 2016-03-30 21:12:21
password: mikemessi
abstract: 有东西被加密了, 请输入密码查看.
message: 您好, 这里需要密码.
wrong_pass_message: 抱歉, 这个密码看着不太对, 请再试试.
theme: xray
---
```

### 全站 `_config.yml`

```yaml
encrypt: # hexo-blog-encrypt
  abstract: 有东西被加密了, 请输入密码查看.
  message: 您好, 这里需要密码.
  wrong_pass_message: 抱歉, 这个密码看着不太对, 请再试试.
  theme: default
  silent: false

  # 加密所有带有以下标签的文章.
  tags:
  - {name: 作为日记加密, password: 密码A}
  - {name: 作为提示加密, password: 密码B}

  # 在密码框旁显示 "解密" 按钮. 默认: true.
  decryptButton:
    show: true
    text: 解密

  # 将派生出的 AES 密钥缓存到 localStorage, 刷新页面时跳过密码输入.
  # 默认: false. 可在这里全局开启, 也可在文章信息头中单独开启.
  # 缓存键为 `hbe.v4.<页面路径>`.
  autoSave: false

  # 让同一篇文章的 PBKDF2 salt 在 clean build 之间保持稳定, 文章身份来自
  # post permalink. 默认: false. 配合 autoSave 时, 适用于
  # Cloudflare Pages、Vercel、Netlify、GitHub Actions 等每次部署都会从
  # 干净环境重新生成 HTML 的平台.
  #
  # 只稳定 salt; AES-GCM nonce 每次加密仍然随机, 避免 nonce reuse.
  # 如果文章 permalink 改变, stable salt 也会改变, 该页面已有的
  # localStorage 缓存会失效.
  stableSalt: false

  # PBKDF2 迭代次数. 下限: 100_000. 推荐 ≥ 600_000
  # (OWASP 2023 关于 PBKDF2-SHA256 的推荐). 低于推荐值时构建会打印 warning.
  # 默认: 250_000.
  kdf:
    iterations: 250000
```

`autoSave` 读取缓存密钥时会比较缓存中的 salt 与当前页面 salt. 仅 nonce
变化不会提前删除缓存; 浏览器会使用缓存密钥配合当前页面的 nonce 与密文尝试
解密. 如果 AES-GCM 认证失败, 该缓存条目会被清除, 访客需要重新输入密码.

### 配置项一览

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `password` | 无 | 加密该文章. `""` 表示不加密, 包括不使用标签加密. 匹配到的标签条目若没有密码, 构建会失败. |
| `password: { env: NAME }` | 无 | 构建时从环境变量 `NAME` 读取密码 (可用于文章信息头、`encrypt.password` 或 `encrypt.tags[].password`). 变量缺失或为空时构建失败; 密码值不会被打印或渲染. 这只能让密码不出现在配置文件中, 不能保护公开提交的明文 Markdown. |
| `abstract` | `Here's something encrypted…` | 首页和归档页显示的摘要. |
| `message` | `Hey, password is required here.` | 密码输入框的提示文字. |
| `wrong_pass_message` | `Oh, this is an invalid password…` | 密码错误时的行内提示. |
| `theme` | `default` | 8 个内置主题之一. 未知名称会回退到 `default` 并打印 warning. |
| `tags` | `[]` | 仅限 `_config.yml`. 标签加密使用的 `{name, password}` 列表. |
| `decryptButton.show` / `.text` | `true` / `Decrypt` | 是否显示解密按钮及其文字. |
| `autoSave` | `false` | 将派生密钥缓存到 `localStorage`. |
| `stableSalt` | `false` | 由 permalink 派生 salt, 让缓存密钥在 clean build 后仍然有效. |
| `kdf.iterations` | `250000` | PBKDF2 迭代次数, 必须是不小于 100,000 的整数. |
| `silent` | `false` | 隐藏构建时的 info 日志. warning 和 error 仍会输出. |
| `wrong_hash_message` | `wrong_pass_message` | 已废弃的别名. AES-GCM 对错误密码和篡改给出同样的结果. |
| `template` | 无 | `theme` 的已废弃别名. |

布尔配置项 (`autoSave`、`stableSalt`、`silent`、`decryptButton.show`) 必须是 `true` 或 `false`. 带引号的 `"true"`/`"false"` 会被接受并打印 warning; 其他值会使构建失败.

`abstract`、`message`、`wrong_pass_message` 和 `decryptButton.text` 的默认值跟随文章的 `lang`/`language`, 否则跟随站点 `language`. `zh`、`zh-CN` 和 `zh-Hans` 使用简体中文, 其他语言使用英文. 显式配置始终优先.

### 对单篇文章禁用标签加密

在该文章的信息头中设置空密码:

```markdown
---
title: 带有加密标签的公开文章
tags:
    - A Tag should be encrypted
password: ""
---
```

## 主题集成

### 解密后事件

文章显示后, 插件会在 `window` 上触发一次 `hexo-blog-decrypt`.
`event.detail.mode` 为 `manual` (输入密码) 或 `cached` (已缓存的密钥).
监听它来重新执行需要扫描正文的代码:

```js
window.addEventListener('hexo-blog-decrypt', function (event) {
  // 重新初始化主题的目录、代码高亮等.
  console.log('Decrypted:', event.detail.mode);
});
```

### 加密文章中的脚本

文章中的脚本会在解密后执行. 自 **4.0.3** 起, 普通外部脚本会按文档顺序加载,
再执行其后的内联脚本, 因此 DPlayer 等依赖库的代码可以正确初始化. 解密事件会等待
恢复的外部脚本加载完成、加载失败或达到 **每个脚本 15 秒** 的期限. 超时不会取消
脚本, 它之后仍可能执行. 原有的 `onload` / `onerror` 处理函数会被保留. 显式
`async` 的脚本仍独立加载, 恢复的 `defer` 脚本不会重建文档解析阶段. 内联
`type="module"` 脚本及脚本中的异步任务保留原生调度, 可能在解密事件之后才完成.

```markdown
<script>
  // 文章解密后执行.
  console.log('Hello from an encrypted post');
</script>
```

### 目录 (TOC)

**不要把加密文章的 `post.origin` 渲染到生成的 HTML 中.** 它保存的是为旧版 Hexo
集成保留的明文. 用 `display:none` 隐藏的 TOC 仍然会公开标题. 搜索、订阅和站点地图
插件也必须排除加密文章的明文字段.

只为未加密文章生成服务端 TOC:

```ejs
<% if (post.toc === true && !post.encrypt) { %>
  <div class="toc-article"><%- toc(post.content, {list_number: true}) %></div>
<% } %>
<%- post.content %>
```

对加密文章, 在 `hexo-blog-decrypt` 回调中根据解密后的 `#hexo-blog-encrypt`
内容在浏览器端生成目录.

### 加密主题

通过文章信息头的 `theme:` 为单篇文章选择主题, 或在 `_config.yml` 中为全站设置.
在线预览:

[default](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/default/) ·
[blink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/blink/) ·
[flip](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/flip/) ·
[shrink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/shrink/) ·
[surge](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/surge/) ·
[up](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/up/) ·
[wave](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/wave/) ·
[xray](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/xray/)

新增主题请参阅 [docs/THEMES.md](./docs/THEMES.md).

## 浏览器支持

解密使用 Web Crypto (`crypto.subtle`), 需要 **安全上下文**: HTTPS 或
`http://localhost`.

| 浏览器 | 最低版本 | 备注 |
| --- | --- | --- |
| Chromium / Edge | 92+ | CI 中通过 Playwright 自动测试 |
| Firefox | 90+ | |
| Safari (macOS / iOS) | 14+ | 发版前手动冒烟测试 |

在非 localhost 的纯 HTTP 站点上, `crypto.subtle` 为 `undefined`, 解密会失败.
生产环境请始终使用 HTTPS.

## 为什么要从 v3 升级

v4 修复了 v3 真实存在的安全短板与体验问题:

- **更强的密码学.** **AES-256-GCM** 自带认证标签, 取代了 v3 的 AES-CBC 加独立
  HMAC: 单一原语、单一认证路径, 不存在 CBC padding-oracle 或 HMAC 比较漏洞.
- **每篇独立 salt 和 nonce.** v3 所有文章共用同一个 salt, 同一个密码到处派生出
  同一个密钥. v4 每篇独立派生密钥, 攻击者无法在使用相同密码的文章间复用 PBKDF2
  计算.
- **更强的 KDF 默认值.** v3 仅使用 **1,024** 轮 PBKDF2-SHA256. v4 默认
  **250,000** 轮 (每次猜测约 240 倍工作量), 推荐 600,000 轮以上 (OWASP 2023).
  可通过 `kdf.iterations` 按文章调整.
- **默认保护隐私.** v3 总是把解密内容缓存到 `localStorage`, 之后使用该设备的人
  可以再次阅读. v4 默认 `autoSave: false`, 按文章或全局开启.
- **行内错误提示.** v3 在密码错误时弹出 `window.alert()`. v4 在输入框旁显示错误
  (`role="alert"`).
- **可选的解密按钮**, 方便不知道按 Enter 提交的读者.
- **更小的体积.** 移除了 CryptoJS, 浏览器端 bundle 约 6 KB (minified).
- **完整测试.** 每次推送都运行 100% 服务端覆盖测试及覆盖全部 8 个主题的
  Playwright 测试.

每项变化的详细原因见 wiki:
[Migration v3 → v4](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Migration-v3-to-v4).

## 从 v3 升级

v4 修改了加密格式 (AES-GCM, 每篇独立 salt 和 nonce). v4 无法读取 v3 的产物,
反之亦然.

1. 升级插件: `npm install --save hexo-blog-encrypt@^4`.
2. 从源文件重新生成: `hexo clean && hexo generate`.
3. 如果使用 CDN, 请清空缓存. 每次加密都使用新的 nonce, 因此每次构建文章 HTML
   都会变化. 运行时资源 `lib/hbe.<hash>.js` 按内容 hash 命名, 只有 bundle
   改变时才会变化.
4. 可选: 从配置和文章信息头中删除 `wrong_hash_message`. 它在 v4 中已废弃,
   将在 v5 中删除.

不会修改任何源 `.md` 文件. 完整的不兼容变更列表见 [CHANGELOG.md](./CHANGELOG.md).

## 参与贡献

欢迎提交 issue 和 pull request. 请先阅读
[CONTRIBUTING.md](./.github/CONTRIBUTING.md). 报告 bug 时请附上复现步骤、日志和
配置, 信息不完整的 issue 可能会被关闭.

- [架构](./docs/ARCHITECTURE.md)
- [开发](./docs/DEVELOPMENT.md)
- [发布](./docs/RELEASING.md)
- [主题](./docs/THEMES.md)

## 许可

[MIT](./LICENSE)

## 感谢

协作者: [xiazeyu](https://github.com/xiazeyu)
