# 故障排查

[English](Troubleshooting)

出问题时, 按顺序逐项排查. 第一个匹配的症状通常就能定位原因.

## 症状: 任何浏览器每次尝试都提示 "decryption failed"

### 原因 1: 页面使用普通 HTTP

Web Crypto 需要安全上下文. 打开 DevTools → Console:

```js
window.isSecureContext   // false → 问题就在这里
```

**解决:** 通过 HTTPS 提供服务. 测试时 `http://localhost:4000/` 可以使用 (安全上下文豁免), 而 `http://192.168.1.10:4000` 这样的局域网 IP 不行.

### 原因 2: 数据格式不匹配 (浏览器从 v4 / v3 客户端看到 v3 / v5 页面)

脚本包会拒绝解密未知的数据格式版本. 在页面源码中检查:

```html
<div id="hexo-blog-encrypt" data-hbe-format="4" ...>
```

v4 应为上面这样. 如果是 `"3"` 或缺失, 说明你拿到的是旧构建遗留的过期密文.

**解决:**
```bash
rm -rf public db.json
hexo generate
```

如果使用了 CDN: 重新构建后清除 CDN 缓存.

### 原因 3: Service worker 缓存了旧脚本包

一些 Hexo 主题会注册 service worker, 激进地缓存 `*.js`. 如果你升级了插件, 但 service worker 仍在提供旧脚本包, 数据格式就会不匹配.

**解决 (单个读者):** DevTools → Application → Service Workers → Unregister.
**解决 (全站):** 提升 service worker 版本号, 让所有访客重新获取.

## 症状: 正确的密码被判定为错误

### 原因 1: 文章信息头中有尾随空格 / 形似的 Unicode 字符

YAML 很挑剔. `password: 'hello '` (带尾随空格) 和 `password: hello` 是不同的密码. 同样, `password: ""` (空字符串) 会**禁用**加密, 而完全没有 `password:` 字段则表示文章继承标签注册表中的密码 (或保持明文).

**解决:** 给密码加引号并去掉首尾空白:

```yaml
password: 'hello'
```

### 原因 2: 密文被篡改

如果反向代理 / CDN / 压缩工具改写了渲染后的 HTML, 尤其是改动了 `<script id="hbeData">…hex…</script>` 块, GCM 认证标签就会校验失败, 并显示同样的 "密码错误" 提示.

**解决:** 将 `*.html` 排除在压缩之外, 或将 `hbeData` 块加入白名单. 该脚本内容是十六进制编码的密文, 任何字节改动都会导致解密失败.

### 原因 3: KDF 迭代次数不匹配

每篇文章都内嵌了构建时使用的迭代次数, 所以通常会自行恢复. 但如果你手动编辑发布后的 HTML 并修改 `data-kdf-iterations`, 解密就会失败. 不要这样做.

## 症状: 构建报错提到 DataCloneError

你使用的是 Node ≥ 18, `structuredClone` 拒绝了一个无法克隆的值 (通常是函数). 最常见的原因: 某个 Hexo 主题或其它插件把函数挂到了已知的配置键上 (例如把 `password` 作为回调).

**解决:** 确保冲突的键是普通值 (string, number, boolean, 普通对象, 普通数组). 插件只会对 [允许列表中的配置键](Configuration-Reference-zh-CN#解析规则详解) 做深度合并, 其它字段都不会经过 `structuredClone`.

## 症状: 构建警告 KDF 迭代次数

```
WARN  hexo-blog-encrypt: kdf.iterations=250000 is below the OWASP-recommended 600_000.
```

这是默认值, 不是错误. 插件发出警告是为了引导你使用更强的 PBKDF2 设置. 提高迭代次数:

```yaml
encrypt:
  kdf:
    iterations: 600000
```

代价: 在 2024 年的笔记本上解密约需 75 ms, 而不是约 30 ms. 如果想不提高迭代次数又屏蔽警告, 只能 fork, 没有 `silentKdf` 开关 (这个警告是有意为之).

## 症状: 构建警告 wrong_hash_message 已弃用

```
WARN  hexo-blog-encrypt: "wrong_hash_message" is deprecated under v4 ...
```

在 AES-GCM 下, 密码错误与密文被篡改在密码学上无法区分. 两条提示现在相同. 要消除警告, 请从配置和文章信息头中删除 `wrong_hash_message`; 如需自定义错误提示, 请设置 `wrong_pass_message`.

## 症状: 按标签加密的文章以明文发布

可能有两个原因:

### 原因 1: 标签名不匹配

YAML / Hexo 在一些意想不到的地方区分大小写. `tags: [Diary]` 与 `tags: { name: diary }` 不会匹配.

**解决:** 让 `_config.yml#encrypt.tags[].name` 与文章 `tags:` 列表中的标签名**逐字节一致**.

### 原因 2: 文章信息头中的 `password: ""`

空字符串密码会禁用加密. 删除该行, 或设置一个真正的密码.

## 症状: MathJax / hljs / mermaid 未在解密后的内容上运行

它们在页面加载时扫描了 DOM, 错过了加密文章 (当时只有密文). 需要在显示出来的内容上重新运行.

**解决:** 参见 [回调与 MathJax](Callbacks-and-MathJax-zh-CN), 添加一个 `hexo-blog-decrypt` 监听器来重新触发它们.

## 症状: 目录 (TOC) 组件为空 / 什么都不显示

根本原因同上: 目录扫描器在页面加载时运行, 没看到任何标题 (标题都在密文里). 不要通过渲染 `toc(post.origin)` 来解决: 这样即使隐藏, 也会发布明文标题. 请按照 [加密目录](Encrypted-TOC-zh-CN) 在解密后重建目录.

## 症状: `npm install hexo-blog-encrypt` 体积很大 / 很慢

不应该这样. 发布的 tarball 有 22 个文件, 打包后约 32 KB. 如果看到 > 1 MB, 说明你那边出了问题 (例如从 git ref 而不是 npm registry 安装, 这会拉取包括 demo 和测试在内的整个仓库).

**解决:** 确认 `package.json` 中写的是 `"hexo-blog-encrypt": "^4.0.0"`, 而不是 `"hexo-blog-encrypt": "github:D0n9X1n/hexo-blog-encrypt"`.

## 症状: 自动保存在重新加载后失效

v4 中 `autoSave` **默认关闭**. 开启方式:

```yaml
# _config.yml — 全站
encrypt:
  autoSave: true
```

或按文章开启:

```markdown
---
title: ...
password: ...
autoSave: true
---
```

缓存键的命名空间为 `hbe.v4.<url-hash>`, 可在 DevTools → Application → Local Storage 中查看. 缓存保存的是**派生密钥** (不是密码), 因此即使 localStorage 内容被窃取, 仍需破解 AES-GCM 才能还原明文.

## 症状: 解密成功但布局错乱

你的主题 CSS 可能只针对原始 (未加密) 的文章容器. 解密后, 脚本包会用一个新容器替换加密包装元素, 新容器保留 `id="hexo-blog-encrypt"` 并添加 `hbe-decrypted-content` class. 如果主题样式写的是 `.post-body > p`, 该选择器可能匹配不到新容器的子元素.

**解决 (主题侧):** 在 CSS 选择器中加入 `.hbe-decrypted-content`, 或将样式作用域限定到文章的外层容器.

## 仍未解决?

在 <https://github.com/D0n9X1n/hexo-blog-encrypt/issues> 提交 issue, 并附上:

- 精简的复现 (一篇加密文章, 最小化的 `_config.yml`)
- 在干净目录中运行 `hexo generate --debug` 的完整输出
- 解密失败时的浏览器控制台输出
- 浏览器及版本, 托管环境 (是否使用 CDN? service worker?)

只要复现足够精简, 大多数 "不能用" 的报告都能在一轮沟通内解决.
