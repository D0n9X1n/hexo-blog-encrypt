# Tag-Based Encryption

[简体中文](Tag-Based-Encryption-zh-CN)

Tag-based encryption lets you encrypt a whole class of posts (e.g. "drafts", "diary", "client-X") with a shared password by tagging them — no per-post `password:` field needed.

## How it works

In `_config.yml`:

```yaml
encrypt:
  tags:
    - { name: diary, password: 'diary-secret' }
    - { name: drafts, password: 'draft-secret' }
    - { name: client-acme, password: 'acme-2024' }
```

In a post:

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

No `password:` field in the front matter. The plugin scans `post.tags`, finds `diary`, looks it up in the registry, and uses `diary-secret`.

## Resolution priority

1. **Front-matter `password:`** wins over everything. If you set `password: foo` in front matter, the post uses `foo` regardless of tags.
2. **First matching tag.** If a post has multiple tags that all appear in the registry, the **first one defined in `_config.yml`** wins (registry order).
3. **No match → not encrypted.** A post tagged `personal` (not in the registry) and with no `password:` in front matter is published in plaintext.

## Disabling encryption for a single tagged post

If a post should normally be encrypted by tag but you want this one to be public:

```markdown
---
title: Public exception
tags:
  - diary
password: ""        # explicit empty string disables encryption
---
```

Empty-string `password:` short-circuits encryption even if the tag would otherwise apply.

## Why this can silently fail (and why it doesn't anymore)

Hexo materializes `post.tags` as a **Warehouse Query**, not a plain array. The query has `.toArray()` and `.forEach()` methods, but `Array.isArray(post.tags)` returns `false`. A naive `Array.isArray` check would silently skip tag matching and **publish the post in plaintext**.

This was a real bug introduced during the v4 redesign and caught by cross-model audit before merge. The current implementation in `src/server/index.js#normalizePostTags` accepts any of:

1. `Array.isArray(tags)` — plain JS arrays (test fixtures)
2. `tags.toArray()` — Warehouse Query (real Hexo posts; preferred when present)
3. `tags.forEach()` — fallback for unusual collection shapes

There are 4 server unit tests + 2 e2e tests guarding this codepath. If you're a plugin contributor: please don't replace the `toArray` / `forEach` checks with `Array.isArray`.

## A shared password, not a shared unlock

Posts encrypted through the same tag use the same **password**, but each post still has its own random salt, and therefore its own key. Readers enter the password once **per post**. `autoSave` remembers the key per page, so it doesn't unlock other posts with the same tag either.

This is deliberate: a shared key would let an attacker who cracks one post read every post with that tag, and it would need a site-wide salt, which v4 removed. If group unlocking is added in the future, it will be opt-in and limited to one tag.

## Mixing tag-based and per-post

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

Per-post `password:` always wins over the tag registry.

## Site config caveat

The `tags` array on `_config.yml#encrypt` is **site-config-only**. Front-matter `tags` is the post's own tag list (a different concept), and the tag registry is not picked up from front matter to avoid Hexo's Warehouse Query issues during deep-merge — see `src/server/config.js#POST_KNOWN_KEYS` vs `KNOWN_KEYS`.

## Live demo

[/demo/tag/](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/tag/) — tagged `ThemeDemos`, password `hello`.
