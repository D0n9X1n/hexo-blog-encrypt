# 架构

[English](Architecture)

一个在构建时加密博客文章的 Hexo 插件。读者在浏览器中输入密码, 通过 **Web
Crypto API** 在客户端解密内容。纯 Node.js, 使用 Hexo 的 filter/generator 钩子;
浏览器端脚本由 esbuild 构建 (运行时无需打包工具)。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `index.js` | Hexo 入口。注册配置默认值、挂在 `after_post_render` 上的 `hexo-blog-encrypt` filter, 以及输出 `css/hbe.style.css` + `lib/hbe.<hash10>.js` 的资源生成器。是 `src/server/index.js` 的一层薄封装。 |
| `src/server/` | 服务端组装。见下方 [服务端模块](#服务端模块-srcserver)。 |
| `src/browser/` | 浏览器端组装。单个 esbuild 产物输出到 `lib/hbe.bundle.js`; 部署时以 `lib/hbe.<hash10>.js` 输出, 用于缓存失效。 |
| `lib/hbe.<theme>.html` | 每个主题的 HTML 包装模板。**一个文件 = 一个主题**, 在 filter 执行时自动发现。参见 [主题开发](Theme-Authoring-zh-CN)。 |
| `lib/hbe.style.css` | 所有主题共用的单个样式表。 |
| `tests/` | 基于真实 Hexo + Playwright 的 e2e 测试框架。`npm test` 运行 lint + 服务端测试 + e2e。 |
| `wiki/` | 唯一的文档来源: 英文 `<Page>.md` 和中文 `<Page>-zh-CN.md`, 由 `publish-wiki.yml` 同步到 GitHub wiki (也就是你现在看到的)。 |
| `.github/workflows/` | CI: `test.yml` (每次 push/PR)、`release.yml` (npm)、`publish-gh-packages.yml` (GH Packages 镜像)、`deploy-demo.yml` (Pages)。 |
| `demo/` | 发布到 GitHub Pages 的在线演示 Hexo 站点。引用已发布的 npm 包, 而**不是** `file:..` 路径。 |
| `ReadMe.md` / `ReadMe.zh.md` | 面向用户的英文 / 中文 README。用户可见的行为变化时**两者都必须更新**。 |
| `scripts/` | 发布工具 (不包含在 tarball 中): `release-notes.sh` 根据已解决的 issue + commit 生成 GitHub Release notes; `release-issues.py` 收集 issue 来源。发布历史见 [GitHub Releases](https://github.com/D0n9X1n/hexo-blog-encrypt/releases); 没有 CHANGELOG 文件。 |

## 服务端模块 (`src/server/`)

| 模块 | 职责 |
| --- | --- |
| `index.js` | 组装根: 把 config + crypto + template + generator 连接到 Hexo filter 回调中。 |
| `config.js` | 将 `hexo.config.encrypt` 与每篇文章的文章信息头深度合并; KDF 迭代次数下限; 严格的布尔选项; `{ env: NAME }` 密码解析; 根据文章/站点语言提供本地化默认值; `wrong_hash_message` → `wrong_pass_message` 默认值处理。标签注册表查找 (以及缺少标签密码时 fail-closed 的检查) 位于 `index.js`。 |
| `crypto.js` | 异步 PBKDF2-SHA256 (libuv 线程池) → AES-256-GCM; 持有服务端唯一的 `DEFAULT_ITERATIONS`。每篇文章 32 字节 salt + 12 字节 nonce。设置 `stableSalt: true` 时, salt 由文章 permalink 派生; nonce 在每次加密时仍然随机。 |
| `template.js` | 11 个 `{{hbe…}}` 占位符的唯一白名单 + 每个占位符的渲染模式 (属性转义 / 文本转义 / hex 校验)。是每个主题 HTML 都要满足的契约。 |
| `generator.js` | Hexo 资源生成器。输出 `css/hbe.style.css` + 带内容哈希的 `lib/hbe.<hex10>.js`。hex10 为 `sha256(bundle).slice(0, 10)`。当 `lib/hbe.bundle.js.map` 存在时, 将其输出为 `lib/hbe.<hex10>.js.map`, 并把 bundle 的 `sourceMappingURL` 改写为该名称; 否则删除该注释。 |
| `logger.js` | 带详细程度开关的 Hexo logger 适配器; 警告和错误始终可见。 |

## 浏览器端脚本 (`src/browser/`)

由 esbuild (`build/build.js`) 构建为单个 IIFE bundle。输出文件
**不**提交到仓库; 它在 `npm run build` 和 `prepack` 时重新生成。入口: `src/browser/main.js`。

| 层 | 作用 |
| --- | --- |
| `readWireFormat()` | 从 `#hexo-blog-encrypt` 读取 `data-hbe-format`。如果不是 `"4"` 则退出。然后从 `data-*` 属性读取 salt / nonce / kdf-iterations / wpm / auto-save。 |
| `deriveKey()` | `crypto.subtle.importKey('raw', utf8(password))` → `crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations, hash:'SHA-256' }, …, AES-GCM, 256)`。 |
| `decrypt()` | `crypto.subtle.decrypt({ name:'AES-GCM', iv:nonce }, key, ciphertextWithTag)`。 |
| `bootstrap()` / `handleSubmit()` | 绑定 `#hbeForm`; 可选地保存派生密钥, 显示解密后的 DOM, 然后派发带 `detail.mode` 的 `hexo-blog-decrypt` 事件。缓存键为 `hbe.v4.` + pathname + query, 而不是 URL 哈希。 |
| `swapInDecryptedDOM()` | 挂载惰性 (inert) 内容, 按文档顺序恢复脚本, 并在触发解密回调前等待外部脚本的 load/error 事件 (每个最多 15 秒)。显式 `async` 的脚本独立加载。内联 module 保留原生的异步执行, 不会延迟回调。 |

## 数据格式 (v4)

浏览器 ↔ 服务端的契约是 `#hexo-blog-encrypt` 包装元素上的 7 个 `data-*` 属性,
加上 `<script id="hbeData">` 的内容。精确的属性 / 占位符表见 [主题开发](Theme-Authoring-zh-CN);
bundle 以 `data-hbe-format="4"` 作为门槛, 对其他任何值都拒绝尝试解密,
因此修改数据格式需要同步提升版本号并更新 bundle。

`stableSalt` 仅在服务端生效, 不会增加第 8 个 `data-*` 属性。启用后,
`src/server/index.js` 由命名空间 `hexo-blog-encrypt:v4:stableSalt:` 加上一个 NUL 分隔符
和文章 permalink 派生出 32 字节 salt。如果 permalink 改变, 稳定 salt 也会改变,
该页面已有的 `autoSave` 缓存随之失效。

对于 `autoSave`, 浏览器缓存条目保留 `{ version, dk, salt,
nonce }`, 以保持 v4 结构兼容。加载时, 如果缓存的 salt 与当前 `data-salt` 不同,
浏览器会清除该条目。仅因缓存的 nonce 不同不会清除; 解密始终使用当前页面的
`data-nonce` 和密文。如果 AES-GCM 认证失败, 缓存会被清除, 密码表单保持可见。

Playwright e2e 测试 (`tests/e2e/decryption.spec.js`) 直接保护这条 clean build 路径:
在开启 `stableSalt` + `autoSave` 的情况下, 它先写入缓存, 在重新加载期间模拟一次重新构建
(相同 salt, 通过服务端 crypto 生成新的 nonce + 密文), 并断言缓存的密钥仍能自动解密
(`mode="cached"`); 另一个配套测试断言 salt 变化后的自愈会重新提示输入密码。

## 代码约定

- 服务端使用 **Node CommonJS** (`require` / `module.exports`); 不做转译。
  浏览器端源码也使用 CommonJS; esbuild 输出 IIFE。
- **ESLint** flat config 位于 `eslint.config.js`; **EditorConfig** 位于 `.editorconfig`;
  遵循现有风格。
- **配置向后兼容。** 新选项必须有安全的默认值。
  已发布的加密文章必须能用相同密码在新 bundle 下解密, 否则必须提升数据格式版本号。
- **两份 README 同步更新。** `ReadMe.md` 和 `ReadMe.zh.md` 以相同顺序包含相同的标题;
  文档测试会对 "Why upgrade" 一节进行检查。
- **Tarball 白名单。** `package.json` 的 `files` 字段将 npm
  tarball 限制为 `index.js` + `src/server/` + `lib/`, 以及包元数据、
  README 和许可证文件。服务端源码在运行时需要。不要发布
  `src/browser/`、`build/`、`tests/`、`demo/` 或 `.github/`。

## 另请参阅

- [主题开发](Theme-Authoring-zh-CN): 单文件主题的放置契约。
- [发布流程](Release-Process-zh-CN): 发布步骤。
- [开发](Development-zh-CN): 工作流规则 + 命令。
