---
title: Tag-Based Encryption Demo
date: 2024-01-10 00:00:00
permalink: /demo/tag/
tags:
  - ThemeDemos
  - feature-demo
---

This post has **no `password:` in its front matter** — instead, it carries the tag `ThemeDemos`, which is configured in `_config.yml` to auto-encrypt with the password `hello`.

<!-- more -->

# Encrypt by tag, not by post

Front matter:

```yaml
---
title: Tag-Based Encryption Demo
tags:
  - ThemeDemos
---
```

Site config:

```yaml
encrypt:
  tags:
    - { name: ThemeDemos, password: hello }
```

Tag-based encryption is useful when you want to encrypt many posts with the same password without repeating the password in every post's front matter. Adding the tag to a post (and the password in the site config) is enough.

> The secret phrase is **the eagle has landed**.

The plugin walks each post's tags; if a tag matches a configured pair, that pair's password is used.
