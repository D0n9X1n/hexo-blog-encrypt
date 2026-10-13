# Encrypted-post table of contents

Theme TOCs either break on encrypted posts or, worse, publish the encrypted
headings through `toc(post.origin)`. The fix is the same for every theme:
remove every plaintext TOC source, keep an empty container, and rebuild the
TOC in the browser after the `hexo-blog-decrypt` event.

- **Procedure and agent skill:** [`plugins/hexo-encrypt/skills/hexo-encrypt-toc/SKILL.md`](../plugins/hexo-encrypt/skills/hexo-encrypt-toc/SKILL.md)
- **Drop-in builder:** [`plugins/hexo-encrypt/skills/hexo-encrypt-toc/scripts/hbe-toc.js`](../plugins/hexo-encrypt/skills/hexo-encrypt-toc/scripts/hbe-toc.js)
- **Leak checker:** [`plugins/hexo-encrypt/skills/hexo-encrypt-toc/scripts/check-toc-leak.js`](../plugins/hexo-encrypt/skills/hexo-encrypt-toc/scripts/check-toc-leak.js)
- **Per-theme examples:** [`plugins/hexo-encrypt/skills/hexo-encrypt-toc/references/themes.md`](../plugins/hexo-encrypt/skills/hexo-encrypt-toc/references/themes.md)
- **User guide:** [wiki: Encrypted TOC](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Encrypted-TOC)

The skill ships as the `hexo-encrypt` Claude Code plugin from this repo's
marketplace (`.claude-plugin/marketplace.json`). It is not part of the npm
package. Users install it in Claude Code:

```text
/plugin marketplace add D0n9X1n/hexo-blog-encrypt
/plugin install hexo-encrypt@hexo-blog-encrypt
```

Validate changes with `claude plugin validate .` and
`claude plugin validate plugins/hexo-encrypt`.

## Wiki source

`docs/wiki/` is the source of truth for the GitHub wiki. On every push to
`master` that changes it, `.github/workflows/publish-wiki.yml` runs
`scripts/publish-wiki.sh`, which mirrors `docs/wiki/*.md` into the wiki
repository and pushes only when something changed. Edit pages here, not in the
wiki UI; wiki-side edits are overwritten on the next publish.
