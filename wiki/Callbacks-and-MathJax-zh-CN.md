# 回调与 MathJax

[English](Callbacks-and-MathJax)

文章解密后，你可能需要重新初始化那些在页面加载时扫描过 DOM 的页面级库：

- **MathJax / KaTeX** — 对新显示的数学公式重新排版
- **highlight.js / Prism** — 对新显示的代码块重新高亮
- **mermaid / plantuml** — 渲染图表
- **目录 (TOC) 组件** — 根据现已可见的标题刷新
- **懒加载器** — 观察新显示的图片

插件为此提供了两个钩子。

## 钩子 1：`hexo-blog-decrypt` window 事件（推荐）

解密成功后，浏览器脚本会立即在 `window` 上派发一个 `hexo-blog-decrypt` `CustomEvent`。

### 最小监听器

把下面的代码放进主题的布局（这样它会在每个页面运行，而不只是已解密的页面）：

```html
<script>
  window.addEventListener('hexo-blog-decrypt', function (e) {
    var mode = (e && e.detail && e.detail.mode) || 'unknown';
    console.log('[hbe] decrypted, mode:', mode);
  });
</script>
```

全新输入密码解密时 `e.detail.mode` 为 `'manual'`；启用了 `autoSave` 后重新加载页面自动解密时为 `'cached'`。忽略 `detail` 的 v3 风格监听器无需改动即可继续工作——两种情况下事件都会触发。

### 完整示例：MathJax

在线演示：**[/demo/mathjax/](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/mathjax/)**（密码 `hello`）。

MathJax 的加载代码既可以放在页面布局里（每个页面都会加载），也可以放在加密正文里（只在解密后加载——对于公式较多的加密文章推荐这样做，避免每个页面都付出加载开销）。

最简洁的做法是让 MathJax 3 对解密后的 DOM 自动排版：

```html
<!-- 1. Configure MathJax before it loads -->
<script>
  window.MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
    startup: { typeset: true }
  };
</script>

<!-- 2. Load MathJax (async, from CDN) -->
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></script>
```

把这两个 `<script>` 标签放在**加密文章正文内**。浏览器脚本会把解密后 HTML 中的 `<script>` 标签重新创建为可执行的节点（见下文“加密文章中的脚本如何运行”），因此 MathJax 只会在用户输入正确密码后加载，并在就绪时立即找到公式。

如果 MathJax 已在全站加载，只需对解密后的文章重新排版：

```html
<script>
  window.addEventListener('hexo-blog-decrypt', function () {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  });
</script>
```

### 完整示例：highlight.js

如果 hljs 在页面加载时运行，漏掉了加密的代码块：

```html
<script>
  window.addEventListener('hexo-blog-decrypt', function () {
    if (window.hljs) {
      document
        .querySelectorAll('#hexo-blog-encrypt pre code')
        .forEach(function (el) { window.hljs.highlightElement(el); });
    }
  });
</script>
```

### 完整示例：alert()（仅用于观察触发）

**[/demo/callback/](https://d0n9x1n.github.io/hexo-blog-encrypt/demo/callback/)** 的在线回调演示使用：

```html
<script>
window.addEventListener('hexo-blog-decrypt', function (e) {
  var mode = (e && e.detail && e.detail.mode) || 'unknown';
  console.log('[demo] hexo-blog-decrypt fired, mode:', mode);
  window.alert('Decryption callback fired! mode = ' + mode);
});
</script>
```

输入密码 → 弹出 `alert()` → 点击确定 → 内容显示。这说明监听器收到了事件。

## 钩子 2：加密正文中的内联 `<script>`

加密 Markdown 正文中的任何内容——包括 `<script>` 标签——都会在文章解密时重新执行。浏览器脚本的 `convertHTMLToElement` 辅助函数会把加密的 `<script>` 标签重新创建为可执行的 DOM 节点（即常见的“innerHTML 不执行脚本”的绕行方法）。

当你希望代码**只为解锁文章的读者运行**时，使用这种方式：

```markdown
---
title: Locked Notes
password: hello
---
Below the cut is private.

<!-- more -->

# Private notes

Some private text.

<script>
  // Only runs when this post is decrypted.
  console.log('reader unlocked the notes');
</script>
```

## 加密文章中的脚本如何运行

`innerHTML = htmlString` 默认**不会**执行 `<script>` 标签——这是浏览器的安全策略。浏览器脚本的绕行方法是：

1. 在一个临时包装元素上设置 `innerHTML` 来解析 HTML
2. 遍历包装元素中的每个 `<script>`，创建一个具有相同属性和文本内容的新 `<script>` 元素，替换已解析但不会执行的脚本
3. 把包装元素追加到 DOM——此时新的脚本节点会执行

随后浏览器脚本派发 `hexo-blog-decrypt`。由于替换发生在派发**之前**，正文 `<script>` 中注册的监听器在事件触发时已经存在。

源码：[`src/browser/dom.js`](https://github.com/D0n9X1n/hexo-blog-encrypt/blob/master/src/browser/dom.js)。

## 加密带目录 (TOC) 的文章

如果你的主题会渲染目录，加密文章的目录是空的，因为标题都在密文里。

**不要渲染 `toc(post.origin)`，即使放在 `display:none` 中也不行。** `post.origin` 是明文；渲染它会把每个标题都发布到页面源码中。本 Wiki 的早期版本曾推荐这种做法，它并不安全。

正确做法是：只为未加密文章渲染服务端目录，保留一个空容器，并在 `hexo-blog-decrypt` 事件之后在浏览器中构建目录。完整的、与主题无关的步骤（含可直接使用的构建脚本和泄漏检查工具）见[加密文章目录](Encrypted-TOC-zh-CN)页面。
