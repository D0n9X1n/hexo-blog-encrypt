# Encrypted-post table of contents

Theme TOCs either break on encrypted posts or, worse, publish the encrypted
headings through `toc(post.origin)`. The fix is the same for every theme:
remove every plaintext TOC source, keep an empty container, and rebuild the
TOC in the browser after the `hexo-blog-decrypt` event.

The whole procedure is one Claude Code skill file:
[`skills/hexo-encrypt-toc/SKILL.md`](../skills/hexo-encrypt-toc/SKILL.md). It
contains the steps, per-theme examples, the drop-in TOC builder (Appendix A)
and the leak checker (Appendix B). It is not part of the npm package. User
guide: [wiki: Encrypted TOC](https://github.com/D0n9X1n/hexo-blog-encrypt/wiki/Encrypted-TOC).

## Wiki source

`docs/wiki/` is the source of truth for the GitHub wiki. On every push to
`master` that changes it, `.github/workflows/publish-wiki.yml` runs
`scripts/publish-wiki.sh`, which mirrors `docs/wiki/*.md` into the wiki
repository and pushes only when something changed. Edit pages here, not in the
wiki UI; wiki-side edits are overwritten on the next publish.
