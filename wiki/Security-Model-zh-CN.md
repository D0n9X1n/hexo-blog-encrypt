# 安全模型

[English](Security-Model)

用直白的话说明 `hexo-blog-encrypt` 设计上能防什么、不能防什么。

## 简要结论

| | |
|---|---|
| **设计目标** | 对公开站点的被动读者隐藏特定文章的*内容*。 |
| **不在设计范围内** | 防御能在读者设备上运行代码、对连接进行中间人 (MITM) 攻击或胁迫你的蓄意攻击者。 |
| **加密强度** | AES-256-GCM, 密钥通过 PBKDF2-SHA256 派生 (≥ 100 000 次迭代, 默认 250 000, 推荐 600 000)。密码学本身是可靠的。最薄弱的环节是你选择的密码和你的托管配置。 |

## 受保护的内容

### 文章正文
执行 `hexo generate` 后, 磁盘上和 CDN 上的文章 HTML **只包含密文 + salt + nonce**。任何地方都不保存明文。能读取你 `public/` 目录的人也无法读到被锁定的文章。

### 篡改
AES-GCM 在生成密文的同时生成一个**认证标签 (auth tag)**。浏览器端脚本在解密时校验该标签。对密文的任何修改, 哪怕只改一个比特, 都会认证失败, 并显示与密码错误相同的 `wrong_pass_message`。能修改你托管 HTML 的攻击者无法在你的密码下替换成自己的内容。

### 跨文章重放
每篇文章独立的 salt 和 nonce 意味着:
- 两篇使用相同密码加密的文章会生成**不同的**密文。
- 即使两篇文章使用相同密码, 知道文章 A 的明文也无助于解密文章 B。

### 构建时的机密
`_config.yml` 中的 `tags[].password` 值**永远不会出现在发布的 HTML 中**。它们只在 `hexo generate` 期间用于派生密钥。

## 不受保护的内容

### 你的密码
本插件不负责帮你选择、保存或传递密码。无论 AES-GCM 多强, 选 `hello` 作为密码都不安全。

### 页面外围信息
标题、日期、标签、分类、`description`、`abstract` 以及密码输入框在发布的 HTML 中都是明文。整个渲染后的正文都会被加密, 包括 `<!-- more -->` 之前的文字; 索引页显示的是 `abstract`。如果标题是 "My password to bank.example.com is hunter2", AES-GCM 也帮不了你。

### 读取文章的其他插件
插件会加密 `post.content`, 并用摘要替换 `post.excerpt` / `post.more`。但在 Hexo 构建期间, 文章对象上仍然存在明文:

| 字段 | 内容 | 可能发布它的组件 |
| --- | --- | --- |
| `post.origin` | 渲染后的明文 HTML | 主题 (目录 (TOC) 组件)、自定义 helper |
| `post.raw`, `post._content` | Markdown 源文本 | 搜索索引和 JSON 生成器、部分 feed 生成器 |
| `post.description` | 文章信息头中的 description | `open_graph()` meta 标签、feed |

任何读取这些字段的生成器或主题 helper 都会把文章内容发布出去。部署之前:

1. 将搜索、feed 和 sitemap 生成器配置为使用 `content` 或 `excerpt`, 绝不使用 `raw`、`_content` 或 `origin`; 或者排除加密文章 (`encrypt: true`)。
2. 不要在 `description` 或 `abstract` 中放机密信息。
3. 用 [加密目录](Encrypted-TOC-zh-CN) 修复主题的目录 (TOC)。
4. 在 `hexo generate` 之后运行泄露检查器; `--body` 还会检查每一行正文:

   ```bash
   node check-toc-leak.js --source source/_posts --public public --body
   ```

   该检查器是 [`hexo-encrypt-toc` skill](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md#appendix-b-check-toc-leakjs) 的附录 B; 参见 [加密目录](Encrypted-TOC-zh-CN)。

### 读者端攻击
- **浏览器扩展、恶意软件、屏幕抓取工具**: 读者解密后, 明文就存在于 DOM 中。读者浏览器中运行的任何东西都能读到它。
- **共享设备**: 如果你开启了 `autoSave`, **派生密钥** (而不是密码) 会保存在 `localStorage` 中。之后任何能访问该浏览器配置文件的人, 都能在刷新时重新解密同一篇文章。使用 `autoSave: false` (默认) 则不存在这个风险。
- **内存转储 / DevTools**: 解密期间密码会短暂存在于 JS 内存中。有意为之的读者 (或控制了读者机器的攻击者) 可以把它提取出来。

### 网络攻击
- **必须使用 HTTPS**: Web Crypto (`crypto.subtle`) 只在安全上下文 (HTTPS 或 localhost) 中可用。在非 localhost 主机上通过普通 HTTP 访问时, 解密会静默失败, 读者什么也看不到。
- **没有 HTTPS 时**, 中间人可以把你的加密页面替换成他自己的 JavaScript, 在读者输入密码时窃取密码。插件无法防御这种攻击, TLS 是你唯一的保护。

### 被迫泄露
如果你被迫 (被法律、被雇主、被任何能对你施压的人) 交出密码, 本插件帮不了你。没有紧急模式, 没有合理否认, 没有远程擦除。如果你的威胁模型包含胁迫, 你需要别的工具。

### 搜索与爬虫
- 加密文章的内容对搜索引擎不可见。这正是**目的所在**, 但值得说明。
- 标题、`description` 和 `abstract` 会被完整索引。不要在其中放机密信息。
- 搜索索引插件在构建时运行, 而不是作为爬虫运行。参见 [读取文章的其他插件](#读取文章的其他插件)。

## 密码学细节 (供审阅者参考)

- **KDF:** PBKDF2-HMAC-SHA256, 默认 250 000 次迭代, 下限 100 000, 推荐 600 000+ (OWASP 2023 对 PBKDF2-SHA256 的建议)。salt 为每篇文章 32 个随机字节, 构建时通过 Node 的 `crypto.randomBytes` 生成; 启用 `stableSalt` 时除外 (见下文)。
- **加密算法:** AES-256-GCM。密钥为 32 字节的 PBKDF2 输出。nonce 为每篇文章 12 个随机字节, 构建时生成。认证标签为 16 字节, 由浏览器通过 Web Crypto 内置的 GCM 认证校验。
- **数据格式 (wire format):** 版本 `4`。浏览器拒绝解密其他版本 (这样 v4 读取端不会静默错误处理 v3 页面, 反之亦然)。
- **没有 HMAC 层。** GCM 提供认证加密 (AEAD), 因此不需要单独的 HMAC 步骤, v4 已将其移除。

### 确定性 salt (`stableSalt`, 需手动开启)

默认情况下, 每次构建都会为每篇文章生成新的随机 salt, 因此攻击者针对某次构建所做的
PBKDF2 预计算对下一次构建毫无用处。当你启用
[`stableSalt`](Configuration-Reference-zh-CN) 后, salt
改为由文章 permalink 派生, 并在**多次重新构建之间保持不变**。其中的权衡:

- salt 本来就是公开的 (无论如何都会写入 `data-salt`), 所以这不会泄露任何新信息。变化在于 salt, 以及由给定密码派生出的密钥, 现在**随时间保持稳定**, 而不是每次构建都轮换。攻击者针对目标文章所做的离线字典攻击工作, 在你修改密码或 permalink 之前一直有效。
- **nonce 仍然在每次加密时随机生成**, 因此无论该设置如何, 都不会发生 AES-GCM nonce 重用。
- 它**默认关闭**。只有当你明确希望 `autoSave` 缓存在 clean build 后仍然有效时 (Cloudflare Pages、Vercel、Netlify、GitHub Actions) 才启用它。强密码和较高的 `kdf.iterations` 才是你真正的防线, 这一点与不使用 `stableSalt` 时相同。

## 建议

- **使用强且唯一的密码。** 由 4 个以上互不相关的单词组成的密码短语是一个合理的起点。
- **通过 HTTPS 提供服务。** 始终如此。
- **提高 `kdf.iterations`**: 如果你的威胁模型包含离线暴力破解, 并且读者能接受约 120 ms 的解密时间: `kdf: { iterations: 1000000 }`。
- **不要在共享设备上启用 `autoSave`。** 默认关闭更安全。只在私人设备上开启。
- **不要在 `<!-- more -->` 之前放机密信息。** 那是公开的预览文字。
- **审查你的主题。** 有些主题会在加密执行**之前**把文章内容泄露到结构化数据 (`<meta>`、JSON-LD、RSS) 中。检查渲染后的 HTML。
- **怀疑泄露时轮换密码。** 默认情况下 salt 和 nonce 每次构建都会改变, 因此重新生成后, 旧的已泄露 HTML 就无关紧要了。**注意:** 启用 `stableSalt` 后, salt 有意在多次重新构建之间保持不变, 因此只有轮换密码 (或修改 permalink), 而不只是重新构建, 才能让旧的派生密钥失效。

## 报告问题

如果你发现了真实的漏洞, 请提交 GitHub issue, 或通过仓库中的联系方式联系维护者。在修复发布之前, 请不要公开发布漏洞利用细节。
