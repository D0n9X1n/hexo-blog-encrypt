# 加密文章目录 (TOC)

[English](Encrypted-TOC)

让任何 Hexo 主题的目录在加密文章上正常工作，**同时不泄露加密的
标题**。

## 问题

插件会把 `post.content` 替换为密文、设置 `post.encrypt = true`，
并把明文保留在 `post.origin` 中。主题的反应分为三种：

| 你看到的现象 | 原因 | 是否安全？ |
| --- | --- | --- |
| 目录为空或缺失 | `toc(post.content)` 读到的是密文 | 安全，但没有目录 |
| 解锁前目录就可见 | `toc(post.origin)` | **泄露标题** |
| 目录先隐藏，解锁后显示 | `toc(post.origin)` + `display:none` | **泄露标题**（查看源码可见） |

2026-10-12 对 13 个流行主题的调查发现：Icarus 会明显泄露标题，
Butterfly、AnZhiYu 和 Volantis 会泄露隐藏的标题。

## 适用于任何主题的修复方法

1. **找到目录代码。** 在主题（以及任何组件包）中搜索
   `toc(`、`.origin`、`encrypt`、`tocbot`、`hexo-blog-decrypt`。
2. **移除明文。** 删除所有 `toc(*.origin)`。把剩下的服务端调用包在
   `if !page.encrypt` 中，但保留空容器：

   ```ejs
   <div id="toc" class="toc-article">
     <% if (!page.encrypt) { %><%- toc(page.content) %><% } %>
   </div>
   ```

3. **解密后重建。**
   - 客户端目录（tocbot 及类似库）：确保 `#hexo-blog-encrypt` 位于扫描器的
     内容选择器范围内，然后在 `hexo-blog-decrypt` 时调用其刷新方法。
   - 服务端目录：加载可直接使用的构建脚本
     `hbe-toc.js`（[skill 的附录 A](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md#appendix-a-hbe-tocjs)）。
     它输出与 Hexo `toc()` 辅助函数相同的标记，因此主题 CSS 依然生效：

     ```html
     <script>
       window.HBE_TOC = {
         container: '#toc',   // the empty container from step 2
         className: 'toc',    // the class the theme passes to toc(); 'nav' for NexT, Keep, Redefine
         onRender: function () { /* call the theme's scrollspy init */ }
       };
     </script>
     <script src="/js/hbe-toc.js"></script>
     ```

4. **验证**没有泄露：

   ```bash
   hexo clean && hexo generate
   node check-toc-leak.js --source source/_posts --public public
   ```

   `check-toc-leak.js`（[skill 的附录 B](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md#appendix-b-check-toc-leakjs)）
   在生成的站点中发现任何密码保护文章的标题时，会以退出码 1 退出。
   对于通过标签加密的文章，用 `--post <file>` 传入。

处理函数规则：不要读取 `event.detail`（有些分支版本派发的是普通 `Event`）；
加载时也要检查 `#hexo-blog-encrypt.hbe-decrypted-content`（缓存的
`autoSave` 密钥可能已先行解密）；并在 PJAX 页面切换后重新运行。

## 让 Claude Code 来做

整个流程就是一个 [Claude Code](https://claude.com/claude-code)
skill 文件：[`skills/hexo-encrypt-toc/SKILL.md`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md)。它包含上述
步骤、构建脚本和泄漏检查工具。把它保存为个人 skill：

```bash
mkdir -p ~/.claude/skills/hexo-encrypt-toc
curl -fsSL https://raw.githubusercontent.com/D0n9X1n/hexo-blog-encrypt/master/skills/hexo-encrypt-toc/SKILL.md \
  -o ~/.claude/skills/hexo-encrypt-toc/SKILL.md
```

然后在博客目录中让 Claude Code：*“修复我主题中加密文章的目录。”*
或运行 `/hexo-encrypt-toc`。

## 各主题示例

NexT、Butterfly、AnZhiYu、Fluid、Icarus、Stellar、Redefine、Volantis、
Matery、Keep、Shoka、Cactus 和 Landscape 的说明见 skill 中的
[Per-theme examples](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/skills/hexo-encrypt-toc/SKILL.md#per-theme-examples)。
它们只是示例；上述步骤适用于所有主题。

注意那些**自带**加密功能的主题（Keep）或**内置了本插件副本**的主题
（Redefine）。只使用一套加密系统，不要同时使用两套。
