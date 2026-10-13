# 主题开发

[English](Theme-Authoring)

`hexo-blog-encrypt` 中的**主题**是包裹加密文章的 HTML 外壳。插件在过滤阶段读取
`lib/hbe.<name>.html` 自动发现主题，因此新增第 9 个（或第 99 个）主题只需
**放入一个文件**——无需修改 `index.js` 或任何浏览器端源码。

这一约定由 `tests/docs.test.js` 强制检查。

目前自带的 8 个主题是：`default`、`blink`、`flip`、`shrink`、
`surge`、`up`、`wave`、`xray`。

## 新增主题

1. 创建 `lib/hbe.<name>.html`，其中包含：
   - 全部 11 个 `{{hbe...}}` 占位符（见下文）——服务端过滤器在渲染时
     替换它们。
   - 一个 `id="hexo-blog-encrypt"`、class 为 `hbe-container` 的包装元素，
     带有下文列出的七个 `data-*` 属性。浏览器脚本会对页面上**每个**
     `[data-hbe-format]` / `.hbe-container` 各初始化一次，因此首页等页面
     可以同时显示多篇加密文章。
   - 一个表单 `<form id="hbeForm" class="hbe-form">`，其中包含：
     - 一个密码输入框 `<input id="hbePass" class="hbe-input-field" type="password">`
       和一个 `<label for="hbePass">`。查找范围限定在包装元素内；多篇文章
       共处一页时，浏览器脚本会重命名重复的输入框 id，并让该文章的 label
       指向新 id。把输入框和 label 包在一个 `.hbe-input` 元素中：输入框有值时
       浏览器脚本会在其上切换 `hbe-input--filled`（用这个 class 设置已填写状态的样式）。
     - 一个 class 为 `hbe-button` 的提交按钮。
     - 一个空的提示区域：`<div role="alert" aria-live="polite">…</div>`。
     - **不要使用内联事件处理器**（`onsubmit`、`onclick`……）。浏览器脚本
       会挂载一个调用 `preventDefault()` 的 `submit` 监听器。严格的
       Content-Security-Policy（不含 `'unsafe-inline'` 的 `script-src` /
       `script-src-attr`）会拦截内联处理器，e2e CSP 测试也会因此失败。
   - 一个 `<script id="hbeData" type="hbeData">{{hbeEncryptedData}}</script>`
     元素，其内容是 AES-256-GCM 密文（末尾附加 16 字节认证标签）的十六进制
     表示。
2. 运行 `npm run test`。自动发现与 e2e 测试框架会识别新文件，并对其执行
   加密/解密往返测试（按主题矩阵运行，见
   `tests/e2e/decryption.spec.js` + `tests/e2e/theme-contract.spec.js`）。
3. 在文章信息头中用 `theme: <name>` 引用它即可。

**没有注册表**需要更新，没有枚举需要扩展，也没有构建步骤。文件名
就是唯一依据。

## 必需的占位符

每个 `lib/hbe.<name>.html` 都必须原样包含以下 11 个占位符。
`src/server/template.js` 会针对每篇加密文章对它们做字符串替换：

| 占位符                     | 字段           | 渲染方式          | 含义                                                                           |
| -------------------------- | -------------- | ----------------- | ------------------------------------------------------------------------------ |
| `{{hbeFormat}}`            | `format`       | 属性转义          | 传输格式版本。v4 下恒为 `"4"`。浏览器脚本据此对过期的解密器快速失败。 |
| `{{hbeWrongPassMessage}}`  | `wpm`          | 属性转义          | 任何解密失败时的内联错误文本（密码错误或密文被篡改——GCM 将两者统一处理）。 |
| `{{hbeWrongHashMessage}}`  | `whm`          | 属性转义          | v4 下已弃用（`wpm` 的别名）。为向前兼容的内省而保留。 |
| `{{hbeKdfIterations}}`     | `kdfIterations`| 属性转义          | 用于派生 AES 密钥的 PBKDF2 迭代次数。默认 250000；可按文章配置。 |
| `{{hbeAutoSave}}`          | `autoSave`     | 属性转义          | 若派生出的 AES 密钥应持久化到 `localStorage`、使之后重新加载时自动解密，则为 `"true"`。默认 `"false"`。 |
| `{{hbeMessage}}`           | `message`      | 属性转义          | 提示文字；可安全用于文本以及 `data-content="…"` 等属性中。                    |
| `{{hbeButtonClass}}`       | `buttonClass`  | 属性转义          | 提交按钮可选的额外 class 后缀（目前用于在 `decryptButton.show: false` 时隐藏按钮）。 |
| `{{hbeButtonText}}`        | `buttonText`   | 文本转义          | 解密提交按钮的可见文字。                                                       |
| `{{hbeSalt}}`              | `salt`         | 十六进制（校验）  | 每篇文章 32 字节的 PBKDF2 盐，表示为 64 个十六进制字符。                       |
| `{{hbeNonce}}`             | `nonce`        | 十六进制（校验）  | 每篇文章 12 字节的 AES-GCM nonce，表示为 24 个十六进制字符。                   |
| `{{hbeEncryptedData}}`     | `ciphertext`   | 十六进制（校验）  | AES-256-GCM 密文与其 16 字节认证标签拼接后的十六进制表示。                     |

浏览器脚本从 `#hexo-blog-encrypt` 包装元素读取的七个 `data-*` 属性是：

| 属性                   | 来源占位符                  | 用途                                                |
| ---------------------- | --------------------------- | --------------------------------------------------- |
| `data-hbe-format`      | `{{hbeFormat}}`             | 传输格式校验（必须为 `"4"`）。                      |
| `data-wpm`             | `{{hbeWrongPassMessage}}`   | 任何解密失败时的内联提示文本。                      |
| `data-whm`             | `{{hbeWrongHashMessage}}`   | 保留（v4 下为 `wpm` 的别名）。                      |
| `data-salt`            | `{{hbeSalt}}`               | 用于密钥派生的 PBKDF2 盐。                          |
| `data-nonce`           | `{{hbeNonce}}`              | AES-GCM nonce。                                     |
| `data-kdf-iterations`  | `{{hbeKdfIterations}}`      | PBKDF2 迭代次数。                                   |
| `data-auto-save`       | `{{hbeAutoSave}}`           | 是否将派生出的密钥持久化到 `localStorage`。         |

`stableSalt` 选项刻意不新增 `data-*` 属性。它只改变服务端渲染页面时
选择 `{{hbeSalt}}` 的方式。浏览器用 `data-salt` 校验缓存的 `autoSave`
密钥，然后始终使用当前页面的 `data-nonce` 和密文解密。如果 AES-GCM
认证失败，缓存会被清除。

## PJAX / 单页应用主题

浏览器脚本会随每篇加密文章注入一次（`<script data-pjax>`），因此可能被
执行多次；每个包装元素只初始化一次。首次执行会暴露幂等的
`window.hexoBlogEncrypt.init(root = document)`，并在 `pjax:complete`、
`pjax:success`、`swup:contentReplaced` 和 `turbo:load`（在 `document` 上监听）
时重新运行它。触发其他事件（或仅触发 jQuery 事件）的路由库应在替换内容后
调用 `window.hexoBlogEncrypt.init()`。

## 禁止事项

为保持“放入一个文件”的约定：

- **不要**新增 `data-*` 属性，除非同时更新服务端过滤器
  （`src/server/template.js` 的 `PLACEHOLDERS` 表 + `src/server/config.js`
  中的 v4 配置流程）**和**浏览器脚本（`src/browser/main.js` 的
  `readWireFormat`）。这两部分共享一个隐式的传输格式，其版本通过
  `{{hbeFormat}}` 递增。
- **不要**重命名或删除 11 个占位符中的任何一个。现有主题——以及外界
  所有已加密的文章——都依赖它们。
- **不要**移动或重命名 `#hexo-blog-encrypt` / `.hbe-container` 包装元素、
  `#hbeForm` / `.hbe-form` 表单、`#hbePass` / `.hbe-input-field` 输入框、
  `.hbe-button` 提交按钮或 `[role="alert"]` 区域。浏览器脚本在每个包装元素内
  按 id / class / role 选取它们。
- **不要**在未运行 `npm run test` 的情况下发布主题。测试框架守护这一约定；
  CI 会拒绝回归。

## 另请参阅

- 服务端过滤器：`src/server/index.js`（组合根）+ `src/server/template.js`（占位符表）
- 浏览器脚本源码：`src/browser/`——通过 `npm run build`（esbuild）构建为 `lib/hbe.bundle.js`。部署时实际提供的文件名会带内容哈希，形如 `lib/hbe.<hex10>.js`，因此每次发布都会自动刷新缓存。
- 现有主题：`lib/hbe.*.html`
