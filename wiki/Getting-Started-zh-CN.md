# 快速上手

[English](Getting-Started)

本指南带你在大约一分钟内从**全新的 Hexo 站点**走到**第一篇加密文章**。

## 1. 安装

```bash
npm install --save hexo-blog-encrypt
# or
yarn add hexo-blog-encrypt
```

插件需要 **Node.js ≥ 18**（使用 `crypto.webcrypto` 和 `structuredClone`）。支持 Hexo ≥ 5（已在 Hexo 7 上验证）。

> 💡 **来源证明（provenance）。** 自 v4.0.0 起，每个版本都会带着签名的
> [provenance](https://docs.npmjs.com/generating-provenance-statements)
> 声明发布到 npmjs，将压缩包与构建它的那次 GitHub Actions 运行绑定。
> `npm audit signatures` 可以帮你验证。

### 备选：从 GitHub Packages 安装

同一版本也以作用域包名 `@d0n9x1n/hexo-blog-encrypt` 镜像到
**GitHub Packages**。这纯粹是为了便于发现（它会出现在仓库的 “Packages”
侧栏中）——内容与 npmjs.com 上的版本完全相同。要使用该镜像，
请在项目的 `.npmrc` 中加入：

```
@d0n9x1n:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

然后运行 `GITHUB_TOKEN=<a token with read:packages scope> npm install --save @d0n9x1n/hexo-blog-encrypt`。

对于其他所有人（除非你的 CI 策略强制只使用 GitHub 仓库源，否则就是所有人），
从 npmjs.com 直接 `npm install hexo-blog-encrypt` 才是标准安装方式。

## 2. 加密一篇文章

在任意文章的文章信息头中添加 `password:` 字段：

```markdown
---
title: My First Encrypted Post
date: 2024-01-01 12:00:00
password: hello
---

Public preview text — anything before the `<!-- more -->` cut is shown
in feeds and the password screen.

<!-- more -->

This part is encrypted.

The secret is **butterfly**.
```

## 3. 构建并预览

```bash
hexo clean && hexo generate && hexo server
```

在浏览器中打开这篇文章。你会看到：

- 一个带有 **abstract**（摘要）和 **message**（提示）文字的密码输入框
- 一个 “Decrypt” 按钮（v4 默认显示；可以隐藏——见[配置参考](Configuration-Reference-zh-CN)）
- 下方一个空的内容区域

输入 `hello` → 点击 **Decrypt**（或按 Enter）→ 秘密内容显示出来。

## 4. 确认静态 HTML 已加密

```bash
grep -r "butterfly" public/    # should NOT find a match
grep -r "hbeData" public/      # SHOULD find your post — proves encryption ran
```

如果 `grep` 找到了明文，说明这篇文章没有被加密。请检查：
- 文章信息头中有 `password:`（且不是空字符串）
- `_config.yml` 没有把 `encrypt:` 设为非对象值
- 构建时没有报错

## 5. 配置全站默认值

```yaml
# _config.yml
encrypt:
  abstract: 'This post is locked.'
  message: 'Password required.'
  theme: default
  wrong_pass_message: 'Wrong password — try again.'
```

全站配置值会被每篇加密文章继承。单篇文章的文章信息头会覆盖全站默认值。完整配置项列表见[配置参考](Configuration-Reference-zh-CN)。

## 6. （可选）基于标签的加密

无需在每篇文章里写 `password:`，即可加密带有某个标签的所有文章：

```yaml
# _config.yml
encrypt:
  tags:
    - { name: diary, password: 'diary-secret' }
    - { name: drafts, password: 'draft-secret' }
```

现在所有带 `diary` 标签的文章都会用 `diary-secret` 加密。详见[基于标签的加密](Tag-Based-Encryption-zh-CN)。

## 下一步

- 浏览 8 个内置[主题](Themes-zh-CN)
- 配置[回调与 MathJax](Callbacks-and-MathJax-zh-CN)，在解密后进行语法高亮 / 公式渲染
- 阅读[安全模型](Security-Model-zh-CN)，了解哪些内容受保护、哪些不受保护
- 如果你的主题显示目录 (TOC)，安装 `hexo-encrypt-toc` Claude Code skill 为加密文章修复它：见[加密文章目录](Encrypted-TOC-zh-CN)
