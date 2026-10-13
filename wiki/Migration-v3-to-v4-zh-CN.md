# 从 v3 迁移到 v4

[English](Migration-v3-to-v4)

v4 是一次主版本升级。这次变化**在数据格式层面不向后兼容**, 但在配置层面**基本**向后兼容。

## 简要结论

```bash
npm install --save hexo-blog-encrypt@^4
hexo clean && hexo generate
# Done. Purge your CDN if you use one.
```

对大多数站点来说, 这就是完整的迁移步骤。浏览一下下面的破坏性变更即可。

## 变更内容

### 数据格式 (破坏性变更)

| | v3 | v4 |
|---|---|---|
| **加密算法** | AES-256-CBC + 单独的 HMAC | **AES-256-GCM** (内置认证标签) |
| **KDF** | PBKDF2-SHA256, 1024 次迭代, 固定 salt | **PBKDF2-SHA256, 250 000 次迭代 (默认)**, **每篇文章 32 字节 salt** |
| **Nonce** | 无 (CBC IV) | **每篇文章 12 字节 nonce** |
| **数据格式标记** | 无 (隐式) | `data-hbe-format="4"` |

**影响:** 磁盘上已有的 v3 密文无法被 v4 读取, 反之亦然。升级后你**必须**重新生成 (`hexo clean && hexo generate`)。不会改动任何源 `.md` 文件, 只影响构建产物。

如果你通过 CDN 提供服务: 重新构建后请清除 CDN 缓存。按照设计, 文章 HTML 每次构建都会逐字节变化 (每次加密都使用新的 nonce), 否则 CDN 缓存命中会返回任何 v4 客户端都无法解密的过期密文。

### 配置 (基本兼容)

| v3 配置项 | v4 状态 | 操作 |
|---|---|---|
| `password` | 未变 | 无 |
| `abstract`, `message`, `theme`, `wrong_pass_message`, `silent`, `tags[]` | 未变 | 无 |
| `wrong_hash_message` | **已弃用**, 作为 `wrong_pass_message` 的别名 | 可选清理; 现在设置它会输出警告 |
| `template` (`theme` 的旧别名) | 自 v3 起**已弃用** | 重命名为 `theme:` |
| `decryptButton` | **新增** | 可选; 默认 `{ show: true, text: 'Decrypt' }` |
| `autoSave` | **新增** | 可选; 默认 `false` |
| `kdf.iterations` | **新增** | 可选; 默认 `250000` |

完整配置结构见 [配置参考](Configuration-Reference-zh-CN)。

### 行为

| 行为 | v3 | v4 |
|---|---|---|
| 密码错误提示 | `alert()` 对话框 | 密码框内的**内联 `[role="alert"]`** |
| 密文被篡改提示 | 单独的 `wrong_hash_message` | **与密码错误相同** (GCM 将两者统一; 在密码学上无法区分) |
| 浏览器密钥持久化 | localStorage 缓存, 始终开启 | **默认关闭**; 通过 `autoSave: true` 手动开启 |
| 缓存键命名空间 | `hexo-blog-encrypt:#<url>` | `hbe.v4.<url-hash>` (读取时会清除 v3 的键) |
| 解密事件 | `Event('hexo-blog-decrypt')` | `CustomEvent('hexo-blog-decrypt', { detail: { mode } })`: 忽略 `detail` 的 v3 监听器仍然可用 |
| 浏览器资源 URL | `/css/hbe.style.css`, `/js/hbe.js` | `/lib/hbe.style.css`, `/lib/hbe.bundle.<hash>.js` (带内容哈希, 用于缓存失效) |

## 为什么这样改

### 为什么用 GCM 而不是 CBC + HMAC?
- **单一原语, 单一认证路径。** CBC + HMAC 组合有两种失败模式 (密钥错误、密文被篡改), 需要分别处理; 处理不当会泄露到底发生了哪一种。GCM 将两者统一: 认证标签校验失败, 你无法判断原因。
- **现代、经过审计、速度快。** Web Crypto 的 `AES-GCM` 在所有相关 CPU 上都有硬件加速。

### 为什么每篇文章使用独立的 salt + nonce?
- v3 的固定 salt 意味着同一密码总是派生出同一密钥。拿到两篇使用相同密码加密的文章的攻击者可以利用这种重用。
- 每篇文章使用新的 salt 让派生出的密钥彼此独立。无论如何, GCM 的安全性都要求每次加密使用新的 nonce。

### 为什么把 KDF 迭代次数从 1024 提高到 250 000?
- 1024 次迭代在现代 GPU 上**轻而易举**就能暴力破解。PBKDF2-SHA256 对 GPU 很友好。
- OWASP 2023 对 PBKDF2-SHA256 的建议是 ≥ 600 000。250 000 是一个折中: 在 2024 年的笔记本上运行约 30 ms, 同时显著提高暴力破解成本。
- 你可以继续提高: 如果读者有耐心, `kdf: { iterations: 1000000 }` 是一个合理的选择。

### 为什么默认 `autoSave: false`?
- v3 总是缓存。任何能接触共享设备的人 (孩子借用笔记本、第二个人的浏览器自动填充了密码等) 都能看到解密后的内容。
- 默认关闭让隐私策略变得**明确**: 密码不会被记住。想要便利的用户可以按文章手动开启。

## 兼容性检查清单

升级后, 请确认:

- [ ] `npm ls hexo-blog-encrypt` 显示 `4.x`
- [ ] `hexo clean && hexo generate` 无错误完成
- [ ] 加密文章的 HTML 包含 `data-hbe-format="4"`
- [ ] 加密文章的 HTML **不**包含你的明文 (用 `grep` 搜索一段已知的机密文字)
- [ ] 浏览器解密正常: 打开页面, 输入正确的密码, 能看到内容
- [ ] 如果你有 `hexo-blog-decrypt` 监听器, 它仍然会触发 (可以加一个 `console.log` 测试)

## 回退到 v3

```bash
npm install --save hexo-blog-encrypt@^3
hexo clean && hexo generate
```

步骤相同, 方向相反。v3 密文会从你的源文件重新生成。

## 完整发布说明

完整的变更列表见 [v4.0.0 发布说明](https://github.com/D0n9X1n/hexo-blog-encrypt/releases/tag/v4.0.0)。
