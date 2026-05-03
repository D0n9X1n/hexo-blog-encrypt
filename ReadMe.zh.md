# hexo-blog-encrypt

[![GitHub release](https://img.shields.io/github/v/release/D0n9X1n/hexo-blog-encrypt?include_prereleases&logo=github&label=release&color=brightgreen)](https://github.com/D0n9X1n/hexo-blog-encrypt/releases)
[![npm](https://img.shields.io/npm/v/hexo-blog-encrypt?logo=npm&color=brightgreen)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![npm downloads](https://img.shields.io/npm/dm/hexo-blog-encrypt?logo=npm&label=downloads)](https://www.npmjs.com/package/hexo-blog-encrypt)
[![License](https://img.shields.io/npm/l/hexo-blog-encrypt?color=brightgreen)](./LICENSE)
[![Tests](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/D0n9X1n/hexo-blog-encrypt/actions/workflows/test.yml)
[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen?logo=github)](https://d0n9x1n.github.io/hexo-blog-encrypt/)

#### 提 issue 之前，请务必提供复现方式，log，配置信息等必要信息。良好的 issue 可以节省双方的时间。
*请严格按照模版要求，不明确的 issue 将直接关闭。*

**参考 issue:**

> + [Issue 83](https://github.com/MikeCoder/hexo-blog-encrypt/issues/83)
> + [Issue 68](https://github.com/MikeCoder/hexo-blog-encrypt/issues/68)

## 这是个啥

- ~~首先, 这是 Hexo 生态圈中 **最好的** 博客加密插件~~

- 你可能需要写一些私密的博客, 通过密码验证的方式让人不能随意浏览.

- 这在 wordpress, emlog 或是其他博客系统中都很容易实现, 然而 hexo 除外. :(

- 为了解决这个问题, 让我们有请 "hexo-blog-encrypt".

## 特性

- 一旦你输入了正确的密码, 加密的文章会在浏览器端解密. 默认情况下密码 **不会** 被持久化; 在文章信息头或 `_config.yml` 中设置 `autoSave: true` 之后, 派生出的密钥才会被缓存到 `localStorage`, 这样下次刷新同一页面时就能自动解密. 若文章中含有脚本, 它将会在解密后被正确执行.

- 支持按标签加密.

- 所有的核心功能都是由原生的 API 所提供的. 在 Node.js中, 我们使用 [Crypto](https://nodejs.org/dist/latest-v12.x/docs/api/crypto.html). 在浏览器中, 我们使用 [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).

- [PBKDF2](https://tools.ietf.org/html/rfc2898) 与 [SHA-256](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) 被用于派生密钥, 我们使用 [AES-256-GCM](https://csrc.nist.gov/publications/detail/sp/800-38d/final) 进行带认证的加解密 — GCM 自带的 auth tag 即可检测密文被篡改 (取代了 v3 中独立的 HMAC 步骤).

- 我们广泛地使用 Promise 来进行异步操作, 以此确保线程不被阻塞.

- 加密页面多主题支持, 现在已经支持的主题有 [`default`, `xray`], 更多的主题正在开发中.

- 过时的浏览器将不能正常显示, 因此, 请升级您的浏览器.

## 在线演示

- 点击 [Demo Page](https://d0n9x1n.github.io/hexo-blog-encrypt/), **所有的密码都是 `hello`**.

## 浏览器支持

运行时使用 Web Crypto (`crypto.subtle`), 因此需要 **安全上下文**
(HTTPS 或 `http://localhost`). 已验证:

| 浏览器 | 最低版本 | 备注 |
| --- | --- | --- |
| Chromium / Edge | 92+ | CI 中通过 Playwright 自动测试 |
| Firefox | 90+ | |
| Safari (macOS / iOS) | 14+ | 发版前手动冒烟 |

如果站点是通过非 localhost 的纯 HTTP 提供, 解密会静默失败
(`crypto.subtle` 为 `undefined`). 生产环境请始终使用 HTTPS.

## 为什么要从 v3 升级

v4 不是表面的刷新, 而是真正修复了 v3 的安全短板与 UX 痛点. 主要原因:

- **更强的密码学.** **AES-256-GCM** 自带的 auth tag 取代了 v3 的
  AES-CBC + 独立 HMAC. 单一原语、单一鉴权路径、硬件加速, 并且免疫一类
  CBC padding-oracle 与 HMAC 比较 bug.
- **每篇独立 salt + nonce.** v3 所有文章共用同一个 salt — 同样的密码
  到处派生出同样的密钥. v4 每篇独立派生密钥 — 攻击者无法把对一个密码
  的 PBKDF2 计算结果, 复用到其它使用相同密码的文章上.
- **更强的 KDF 默认值.** v3 默认仅 **1,024** 轮 PBKDF2-SHA256 — 远低于
  现代推荐值, 在现代硬件上很容易被批量爆破均摊. v4 默认 **250,000**
  轮 (≈ 240× 单次工作量), 推荐 ≥ 600,000 (OWASP 2023). 可通过
  `kdf.iterations` 按文章覆盖.
- **隐私默认关闭.** v3 总是把解密后的密钥缓存到 `localStorage`, 共享
  设备的下一个用户可以直接重看. v4 默认 `autoSave: false`, 你按需开启
  (按文章或全局).
- **行内错误提示.** v3 用 `window.alert()` 弹窗提示密码错 — 移动端
  尤其打断流程. v4 直接把错误显示在密码框旁边 (`role="alert"`).
- **可选的"解密"按钮.** 让不知道按 Enter 的访客也能用. 文案可配置.
- **更小.** 抛弃了打包的 CryptoJS 依赖, 改用浏览器原生 Web Crypto
  API. 浏览器端 bundle ≈ 6 KB (minified).
- **有测试.** 服务端套件 100% 行 / 分支 / 函数覆盖 + Playwright e2e
  覆盖全部 8 个主题. v3 几乎没有自动化测试; v4 每次推送都跑回归.

如果你在意有人能拉到你生成的 HTML 后做离线密码爆破, 或者在意共用
设备上缓存密钥被偷看 — 请升级.

每条变化更深入的"为什么", 见 wiki:
[Migration v3 → v4](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Migration-v3-to-v4).

## 从 v3 升级

v4 修改了密文格式 (AES-GCM, 每篇文章独立 salt + 每次加密独立 nonce).
v3 加密的产物在 v4 下无法解密, 反之亦然. 升级步骤:

1. 升级插件: `npm install --save hexo-blog-encrypt@^4`.
2. 重新生成: `hexo clean && hexo generate`.
3. 如果使用 CDN, 请清空缓存 (按设计, 每次构建文章 HTML 都会变化 —
   每次加密都使用新的 nonce — 但运行时资源 `lib/hbe.<hash>.js`
   是按内容 hash 命名的, 只有 bundle 改变时 URL 才会变).
4. 可选: 从 `_config.yml` 与 front-matter 中删除 `wrong_hash_message`
   (v4 起废弃, v5 中删除).

不会触碰任何源 `.md` 文件. 完整的 break 列表与新增的 `decryptButton` /
`autoSave` / `kdf.iterations` 等配置请见 [CHANGELOG.md](./CHANGELOG.md).

## 安装

- `npm install --save hexo-blog-encrypt`

- 或 `yarn add hexo-blog-encrypt` (需要) [Yarn](https://yarnpkg.com/en/))

## 快速使用

- 将 "password" 字段添加到您文章信息头就像这样.

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: hello
---

```

- 再使用 `hexo clean && hexo g && hexo s` 在本地预览加密的文章.

## 设置优先级

文章信息头 > 按标签加密

## 高级设置

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
# v4 起已废弃 — AES-GCM 已经将 “密码错误” 与 “密文被篡改” 这两类失败统一处理,
# 该字段现在等同于 `wrong_pass_message`. 请改设 `wrong_pass_message`.
wrong_hash_message: 抱歉, 这个文章不能被校验, 不过您还是能看看解密后的内容.
---

```

### `_config.yml`

#### 示例

```yaml

# Security
encrypt: # hexo-blog-encrypt
  abstract: 有东西被加密了, 请输入密码查看.
  message: 您好, 这里需要密码.
  tags:
  - {name: tagName, password: 密码A}
  - {name: tagName, password: 密码B}
  wrong_pass_message: 抱歉, 这个密码看着不太对, 请再试试.
  # v4 起已废弃 (等同于 `wrong_pass_message`), 详见上方说明.
  wrong_hash_message: 抱歉, 这个文章不能被校验, 不过您还是能看看解密后的内容.

  # ── v4 新配置 (全部可选, 均有安全的默认值) ────────────────────────────
  # 在密码框旁渲染一个可见的 “解密” 按钮.
  # 主题模板若已经通过 `<%- decrypt_button %>` 自带按钮则会忽略本配置.
  # 默认: true.
  decryptButton:
    show: true
    text: 解密

  # 解密后是否将明文缓存到 localStorage, 让刷新页面跳过密码输入.
  # 默认 OFF — 可在文章 front-matter 中通过 `autoSave: true` 单独开启,
  # 也可以在这里全局开启. 缓存键命名空间为 `hbe.v4.<post-permalink-hash>`.
  autoSave: false

  # PBKDF2 迭代次数. 下限: 100_000. 推荐 ≥ 600_000
  # (OWASP 2023 关于 PBKDF2-SHA256 的推荐). 低于推荐值时构建会打印 warning.
  # 默认: 250_000.
  kdf:
    iterations: 250000

```

#### 对博文禁用 Tag 加密

只需要将博文头部的 `password` 设置为 `""` 即可取消 Tag 加密.

Example:

```
---
title: Callback Test
date: 2019-12-21 11:54:07
tags:
    - A Tag should be encrypted
password: ""
---

Use a "" to diable tag encryption.
```

### 配置优先级

文章信息头 > `_config.yml` (站点根目录下的) > 默认配置

### 关于 Callback 函数
在部分博客中, 解密后部分元素可能无法正常显示或者表现, 这属于已知问题. 目前的解决办法是通过自行查阅自己的博客中的代码, 了解到在 onload 事件发生时调用了哪些函数, 并将这些函数挑选后写入到博客内容中. 如:

```
---
title: Callback Test
date: 2019-12-21 11:54:07
tags:
    - Encrypted
---

This is a blog to test Callback functions. You just need to add code at the last of your post like following:

It will be called after the blog decrypted.

<script>
    // 添加一个 script tag 与代码在文章末尾.
    alert("Hello World");
</script>
```

例子在: [Callback 例子](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/callback/).

### 解密后的触发事件
感谢 @[f-dong](https://github.com/f-dong), 我们现在会在解密完成后触发一个 `hexo-blog-decrypt` 事件, 你们可以编写 callback 来监听该事件.

```
// trigger event
var event = new Event('hexo-blog-decrypt');
window.dispatchEvent(event);
```

### 对 TOC 进行加密

如果你有一篇文章使用了 TOC，你需要修改模板的部分代码。这里用 landscape 作为例子：

+ 你可以在 hexo/themes/landscape/layout/_partial/article.ejs 找到 article.ejs。
+ 然后找到 <% post.content %> 这段代码，通常在30行左右。
+ 使用如下的代码来替代它:

```
<% if(post.toc == true){ %>
  <div id="toc-div" class="toc-article" <% if (post.encrypt == true) { %>style="display:none" <% } %>>
    <strong class="toc-title">Index</strong>
      <% if (post.encrypt == true) { %>
        <%- toc(post.origin, {list_number: true}) %>
      <% } else { %>
        <%- toc(post.content, {list_number: true}) %>
      <% } %>
  </div>
<% } %>
<%- post.content %>
```

### 禁用 Log
If you want to disable the logging, you can add a silent property in `_config.yml` and set it to true.
如果你想要禁止使用 Log, 你可以在 `_config.yml` 中增加一个 silent 属性, 并将其设置为 true.

```yaml
# Security
encrypt: # hexo-blog-encrypt
  silent: true
```

这样就会禁止如 `INFO  hexo-blog-encrypt: encrypting "{Blog Name}" based on Tag: "EncryptedTag".` 的日志.

### 加密主题

之前, 我们尝试使用 `template` 关键字来让用户能修改自己的主题. 后来发现真不是一个好主意. 所以我们现在引入了主题: `theme` 关键字.

你可以简单的使用 `theme` 在 `_config.yml` 里或者文章头, 如下:

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
theme: xray
wrong_pass_message: 抱歉, 这个密码看着不太对, 请再试试.
# v4 起已废弃 (等同于 `wrong_pass_message`), 详见 “高级设置”.
wrong_hash_message: 抱歉, 这个文章不能被校验, 不过您还是能看看解密后的内容.
---

```

### 在 `_config.yml`

#### 示例

```yaml

# Security
encrypt: # hexo-blog-encrypt
  abstract: 有东西被加密了, 请输入密码查看.
  message: 您好, 这里需要密码.
  tags:
  - {name: tagName, password: 密码A}
  - {name: tagName, password: 密码B}
  theme: xray
  wrong_pass_message: 抱歉, 这个密码看着不太对, 请再试试.
  # v4 起已废弃 (等同于 `wrong_pass_message`), 详见 “高级设置”.
  wrong_hash_message: 抱歉, 这个文章不能被校验, 不过您还是能看看解密后的内容.

```

你可以在线挑选你喜欢的主题,并应用到你的博客中:

+ [default](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/default/)
+ [blink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/blink/)
+ [shrink](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/shrink/)
+ [flip](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/flip/)
+ [up](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/up/)
+ [surge](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/surge/)
+ [wave](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/wave/)
+ [xray](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/theme/xray/)


## 许可

看看 [LICENSE](./LICENSE).

## 感谢

Collaborator - [xiazeyu](https://github.com/xiazeyu)
