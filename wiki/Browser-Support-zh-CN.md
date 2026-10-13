# 浏览器支持

[English](Browser-Support)

浏览器端解密使用 **Web Crypto API** (`crypto.subtle`), 它有两个硬性要求:

1. 现代浏览器
2. **安全上下文**: HTTPS, 或本地开发时的 `http://localhost`

## 支持的浏览器

| 浏览器 | 最低版本 | 测试方式 |
|---|---|---|
| Chromium / Chrome / Edge | **92+** | 每个 PR 都用 Playwright Chromium 运行完整的端到端测试 |
| Firefox | **90+** | 发布时手动抽查; 使用相同的 Web Crypto API |
| Safari (macOS) | **14+** | 发布时手动冒烟测试 |
| Safari (iOS) | **14+** | 发布时手动冒烟测试 |

旧版浏览器会静默解密失败: `crypto.subtle` 为 `undefined`, 脚本包直接短路并显示行内错误提示. 页面本身正常加载, 只是无法解密.

## HTTPS 要求

Web Crypto **只**在 [安全上下文](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) 中可用:

- ✅ `https://your-site.example.com/...`
- ✅ `http://localhost:4000/...` (任意端口)
- ✅ `http://127.0.0.1:4000/...`
- ❌ `http://your-site.example.com/...`
- ❌ `http://192.168.1.10:4000/...` (局域网 IP, 不是 localhost)
- ❌ `file:///Users/you/site/index.html`

如果所有读者都看到 "decryption failed", **请检查页面 URL 是否为 `https://`**. 这是 "在我的 localhost 上可以, 部署后就不行" 最常见的原因.

## Service worker / 浏览器扩展呢?

脚本包是普通的客户端 JS: 没有 service worker, 没有扩展清单, 也不需要特殊权限. 它和其它脚本一样运行在浏览器的主 JS 上下文中.

## 移动端浏览器

现代移动端浏览器 (iOS Safari ≥ 14, Android 上的 Chrome ≥ 92, Android 上的 Firefox ≥ 90) 无需任何改动即可使用. 触屏键盘, 密码自动填充以及生物识别自动填充 (Touch ID / Face ID 从系统密码管理器中选择正确的条目) 都能正常工作, 因为密码输入框是标准的 HTML `<input type="password">`.

## 旧版 IE / 非常旧的浏览器

对不支持 Web Crypto 的浏览器**没有降级方案**. v3 使用 CryptoJS (纯 JS 实现), 可在 IE11 中运行. 出于安全和性能考虑, v4 放弃 CryptoJS, 改用原生 Web Crypto:

- 原生 Web Crypto 用 C/汇编执行 AES 轮运算, 并在可用时使用硬件加速
- CryptoJS 在 JS 中运行, 会把密钥材料泄露到 JS 堆中, 而且多年前就已不再有实质性更新

如果确实需要支持 IE11, 请锁定 v3.x 并避免使用 v4 特性.

## 在本地验证支持情况

在浏览器的 JS 控制台中:

```js
typeof crypto.subtle           // "object" — 正常
crypto.subtle.encrypt          // function — 正常
window.isSecureContext         // true — 正常
```

如果其中任何一项返回 `undefined` / `false`, 解密就会失败.

## CI / 自动化测试

我们的 CI 使用 Playwright 驱动的无头 Chromium (`tests/e2e/`). 它运行在安全上下文中 (Playwright 在 localhost 上启动测试服务器), 并支持完整的 Web Crypto API. 如果你要把本插件集成到自己的 CI 中, 同样的配置即可使用.
