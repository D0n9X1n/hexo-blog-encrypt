# 基于标签的加密

[English](Tag-Based-Encryption)

基于标签的加密让你只需给文章打标签, 就能用一个共享密码加密一整类文章 (例如 "drafts"、"diary"、"client-X"), 无需在每篇文章中写 `password:` 字段。

## 工作原理

在 `_config.yml` 中:

```yaml
encrypt:
  tags:
    - { name: diary, password: 'diary-secret' }
    - { name: drafts, password: 'draft-secret' }
    - { name: client-acme, password: 'acme-2024' }
```

在文章中:

```markdown
---
title: Today's entry
date: 2024-01-01
tags:
  - diary
  - personal
---

This post is tagged `diary`, so it's encrypted with `diary-secret`.

<!-- more -->

Private content.
```

文章信息头中没有 `password:` 字段。插件扫描 `post.tags`, 找到 `diary`, 在注册表中查找它, 并使用 `diary-secret`。

## 解析优先级

1. **文章信息头中的 `password:`** 优先级最高。如果你在文章信息头中设置了 `password: foo`, 无论标签如何, 文章都使用 `foo`。
2. **第一个匹配的标签。** 如果一篇文章有多个标签都出现在注册表中, 以 **`_config.yml` 中最先定义的那个**为准 (注册表顺序)。
3. **没有匹配 → 不加密。** 一篇打了 `personal` 标签 (不在注册表中)、且文章信息头中没有 `password:` 的文章会以明文发布。

## 为单篇带标签的文章关闭加密

如果某篇文章按标签本应被加密, 但你希望这一篇公开:

```markdown
---
title: Public exception
tags:
  - diary
password: ""        # explicit empty string disables encryption
---
```

空字符串的 `password:` 会直接跳过加密, 即使标签本来会生效。

## 为什么这里可能静默失效 (以及为什么现在不会了)

Hexo 把 `post.tags` 实现为一个 **Warehouse Query**, 而不是普通数组。该 query 有 `.toArray()` 和 `.forEach()` 方法, 但 `Array.isArray(post.tags)` 返回 `false`。简单地用 `Array.isArray` 检查会静默跳过标签匹配, 并**以明文发布文章**。

这是 v4 重新设计期间引入的真实 bug, 在合并前被跨模型审计发现。`src/server/index.js#normalizePostTags` 中的当前实现接受以下任意一种:

1. `Array.isArray(tags)`: 普通 JS 数组 (测试 fixture)
2. `tags.toArray()`: Warehouse Query (真实的 Hexo 文章; 存在时优先使用)
3. `tags.forEach()`: 针对少见集合形态的兜底方案

有 4 个服务端单元测试 + 2 个 e2e 测试保护这条代码路径。如果你是插件贡献者: 请不要把 `toArray` / `forEach` 检查替换成 `Array.isArray`。

## 共享的是密码, 不是解锁状态

通过同一标签加密的文章使用相同的**密码**, 但每篇文章仍有自己的随机 salt, 因此也有自己的密钥。读者需要**每篇文章**输入一次密码。`autoSave` 按页面记住密钥, 因此它也不会解锁同一标签下的其他文章。

这是有意为之: 共享密钥会让破解了一篇文章的攻击者读到该标签下的所有文章, 而且它需要一个全站 salt, 而 v4 已将其移除。如果将来加入分组解锁, 它会是需手动开启的, 并且仅限于单个标签。

## 混合使用标签加密和单篇加密

```yaml
# _config.yml
encrypt:
  tags:
    - { name: diary, password: 'diary-secret' }
```

```markdown
---
title: Important Diary Entry
tags:
  - diary
password: 'override-this-one'   # per-post wins; encrypted with override-this-one
---
```

单篇文章的 `password:` 始终优先于标签注册表。

## 站点配置注意事项

`_config.yml#encrypt` 上的 `tags` 数组**只能在站点配置中设置**。文章信息头中的 `tags` 是文章自身的标签列表 (一个不同的概念), 并且为了避免深度合并时 Hexo 的 Warehouse Query 问题, 标签注册表不会从文章信息头中读取。参见 `src/server/config.js#POST_KNOWN_KEYS` 与 `KNOWN_KEYS`。

## 在线演示

[/demo/tag/](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/tag/): 标签为 `ThemeDemos`, 密码 `hello`。
