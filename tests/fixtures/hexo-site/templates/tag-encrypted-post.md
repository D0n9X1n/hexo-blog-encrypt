---
title: Tag-Encrypted Post (no front-matter password)
slug: tag-only-encrypted
date: 2024-01-02 00:00:00
theme: default
tags:
  - TagOnly
---
This post has no `password:` field — it is encrypted via the tag registry
in `_config.yml.encrypt.tags`. The plaintext below MUST NOT appear in the
generated HTML; if it does, tag-based encryption silently failed and is
leaking content. The decryption password is `tagsecret`.

The secret phrase is **OPEN-SESAME-TAG-ONLY**.
