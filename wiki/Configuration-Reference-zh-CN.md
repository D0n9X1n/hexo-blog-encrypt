# 配置参考

[English](Configuration-Reference)

所有选项的默认值, 类型以及可设置的位置.

## 在哪里设置选项

共有三处, 优先级依次升高:

1. **内置默认值** (位于 `src/server/config.js#DEFAULTS`)
2. **站点配置**: `_config.yml` → `encrypt:` 块, 作用于所有加密文章
3. **文章信息头**: 只对该篇文章覆盖站点配置

嵌套对象 (`kdf`, `decryptButton`) 采用**深度合并**, 数组 (尤其是 `encrypt.tags`) 采用**整体替换**.

## 全部选项

### 必填

| 键 | 类型 | 位置 | 说明 |
|---|---|---|---|
| `password` | string | 文章信息头, 或 `_config.yml` 中的 `tags[].password` | 解锁文章的密码. 不能为空. 在文章信息头中设置 `password: ""` 会对原本会继承标签密码的文章**禁用**加密. |

### 显示

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `abstract` | string | `Here's something encrypted, password is required to continue reading.` | 显示在密码输入框上方. |
| `message` | string | `Hey, password is required here.` | 显示在密码输入框旁边. |
| `theme` | string | `default` | 可选值: `default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray`. 参见 [主题](Themes-zh-CN). |
| `wrong_pass_message` | string | `Oh, this is an invalid password. Check and try again, please.` | 解密失败时显示的行内错误 (密码错误或密文被篡改, v4 通过 GCM 认证标签校验失败将两者统一). |

### 解密按钮 (v4)

```yaml
decryptButton:
  show: true        # boolean
  text: 'Decrypt'   # string
```

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `decryptButton.show` | boolean | `true` | 在密码输入框旁渲染一个可点击的解密按钮. 设为 `false` 则只保留回车提交. |
| `decryptButton.text` | string | `'Decrypt'` | 按钮文字. 可设为本地化用语. |

通过 `<%- decrypt_button %>` 模板插槽自带按钮的主题会忽略此选项.

### autoSave (v4)

```yaml
autoSave: false     # boolean
```

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `autoSave` | boolean | `false` | 为 `true` 时, **派生密钥** (不是密码, 也不是明文) 会以文章 URL 为键缓存到 `localStorage`. 之后重新加载同一页面会自动解密. 默认关闭, 可按文章或全局开启. 它会泄露什么, 参见 [安全模型](Security-Model-zh-CN). |

### stableSalt (v4.0.2+)

```yaml
stableSalt: false   # boolean
```

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `stableSalt` | boolean | `false` | 为 `true` 时, 每篇文章的 PBKDF2 salt 由**文章固定链接确定性派生**, 而不是随机生成, 因此在从零开始的静态重建之间保持不变. 与 `autoSave` 配合使用: 在每次部署都从干净环境重新生成 HTML 的平台上 (Cloudflare Pages, Vercel, Netlify, GitHub Actions), 由于 salt 以及派生密钥不变, 之前构建时缓存的密钥依然可用. **只有 salt 是固定的, AES-GCM nonce 在每次加密时仍然随机生成**, 因此不会重用 nonce. 如果固定链接改变, 固定 salt 也会改变, 该页面已有的 `localStorage` 缓存随之失效. 默认关闭, 可按文章或全局开启. 开启前请先阅读 [安全模型](Security-Model-zh-CN) 中关于确定性 salt 的权衡. |

### KDF (v4)

```yaml
kdf:
  iterations: 250000   # integer
```

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `kdf.iterations` | integer | `250000` | PBKDF2-SHA256 迭代次数. **下限: 100 000** (低于此值构建中止). **建议: ≥ 600 000** (OWASP 2023 对 PBKDF2-SHA256 的建议), 低于 `600_000` 时构建会输出警告. 数值越高, 暴力破解越慢, 解密也越慢. 这一开销在读者浏览器中每次尝试密码时支付一次; 在 2024 年的笔记本上, 250 000 次迭代约 30 ms. |

### 日志

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `silent` | boolean | `false` | 屏蔽本插件在构建时输出的 `INFO`/`WARN` 日志. 错误仍会抛出. |

### 标签注册表

```yaml
tags:
  - { name: diary, password: 'diary-secret' }
  - { name: drafts, password: 'draft-secret' }
```

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `tags` | `{name, password}` 数组 | `[]` | 仅限站点配置. 文章的 `tags:` 中包含任一注册表名称时, 会用该注册表密码加密, 无需在文章信息头中设置 `password:`. 参见 [按标签加密](Tag-Based-Encryption-zh-CN). |

### 已弃用

| 键 | 状态 | 说明 |
|---|---|---|
| `wrong_hash_message` | **v4 中弃用, v5 中移除.** | v3 中表示 "密文被篡改" 的提示. 在 AES-GCM 下, 密码错误与密文被篡改在密码学上无法区分, 因此它现在是 `wrong_pass_message` 的别名. 设置它会输出警告. 请改为设置 `wrong_pass_message`. |
| `template` | **v3 起弃用, v5 中移除.** | `theme` 的旧名称. |

## 示例

### 最简配置 (全站默认值, 按文章设置密码)

```yaml
# _config.yml
encrypt:
  theme: default
```

```markdown
---
title: Locked
date: 2024-01-01
password: hello
---
```

### 本地化 + 自定义按钮 + 慢速 KDF

```yaml
# _config.yml
encrypt:
  abstract: 'この投稿は暗号化されています。'
  message: 'パスワードを入力してください。'
  wrong_pass_message: 'パスワードが間違っています。'
  theme: wave
  decryptButton:
    show: true
    text: '復号'
  kdf:
    iterations: 1000000   # 在 2024 年的笔记本上解密约需 120 ms
```

### 单篇文章覆盖某个站点默认值

```markdown
---
title: This One Uses xray
date: 2024-01-01
password: hello
theme: xray
decryptButton:
  show: false
---
```

全站都使用 `theme: default`, 这篇文章使用 `theme: xray` 并隐藏按钮.

### 只在部分文章开启 autoSave

```yaml
# _config.yml — 全站关闭 autoSave
encrypt:
  theme: default
```

```markdown
---
title: Long Reading List (autosaved so reloads stay decrypted)
date: 2024-01-01
password: hello
autoSave: true
---
```

## 解析规则详解

插件为每篇文章计算:

```
DEFAULTS
  ⇣ deep-merge with selected keys from _config.yml#encrypt
  ⇣ deep-merge with selected keys from post front matter
= effective config for this post
```

选定的键 (允许列表) 为: `password`, `abstract`, `message`, `theme`, `template`, `wrong_pass_message`, `wrong_hash_message`, `silent`, `autoSave`, `decryptButton`, `kdf`, 以及仅来自站点配置的 `tags`.

文章信息头中的其它字段都会被本插件**忽略** (Hexo 的其它过滤器仍能看到它们).

## 以源码为准

上述默认值与 `src/server/config.js#DEFAULTS` 一致. 如果两者不一致, 以该文件为准, 请提交 issue.
