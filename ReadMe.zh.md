# hexo-blog-encrypt

[![npm version](https://badge.fury.io/js/hexo-blog-encrypt.svg)](https://badge.fury.io/js/hexo-blog-encrypt)
[![Build Status](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/build.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/build-status/master)
[![Scrutinizer Code Quality](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/quality-score.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/?branch=master)

#### 提 issue 之前，请务必提供复现方式，log，配置信息等必要信息。良好的 issue 可以节省双方的时间。
*请严格按照模版要求，不明确的 issue 将直接关闭。*

**参考 issue:**

> + [Issue 83](https://github.com/MikeCoder/hexo-blog-encrypt/issues/83)
> + [Issue 68](https://github.com/MikeCoder/hexo-blog-encrypt/issues/68)

## 这是个啥

- ~~首先, 这是 Hexo 生态圈中 **最好的** 博客加密插件~~

- 你可能需要写一些私密的博客, 通过密码验证的方式让人不能随意浏览.

- 这在 wordpress, emlog 或是其他博客系统中都很容易实现, 然而 hexo 除外. :(

- 为了解决这个问题, 让我们有请 "hexo-blog-encrypt".

## 特性

- 一旦你输入了正确的密码, 它将会被存储在本地浏览器的 localStorage中. 按个按钮, 密码将会被清空. 若博客中又脚本, 它将会被正确地执行.

- 支持按标签加密.

- 所有的核心功能都是由原生的 API 所提供的. 在 Node.js中, 我们使用 [Crypto](https://nodejs.org/dist/latest-v12.x/docs/api/crypto.html). 在浏览器中, 我们使用 [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).

- [PBKDF2](https://tools.ietf.org/html/rfc2898), [SHA256](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) 被用于分发密钥, [AES256-CBC](https://csrc.nist.gov/publications/detail/sp/800-38a/final) 被用于加解密, 我们还使用 [HMAC](https://csrc.nist.gov/csrc/media/publications/fips/198/1/final/documents/fips-198-1_final.pdf) 来验证密文的来源, 并确保其未被篡改.

- 我们广泛地使用 Promise 来进行异步操作, 以此确保线程不被杜塞.

- 过时的浏览器将不能正常显示, 因此, 请升级您的浏览器.

## 在线演示

- 点击 [Demo Page](https://mhexo.github.io/), **所有的密码都是 `hello`**.

## 安装

- `npm install --save hexo-blog-encrypt`

- 或 `yarn add hexo-blog-encrypt` (需要) [Yarn](https://yarnpkg.com/en/))

## 快速使用

- 将 "password" 字段添加到您文章信息头就像这样.

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: mikemessi
---

```

- 再使用 `hexo clean && hexo g && hexo s` 在本地预览加密的文章.

## 设置优先级

文章信息头 > 按标签加密

## 高级设置

### 文章信息头

```markdown

---
title: Hello World
tags:
- 作为日记加密
date: 2016-03-30 21:12:21
password: mikemessi
abstract: 有东西被加密了, 请输入密码查看.
message: 您好, 这里需要密码.
wrong_pass_message: 抱歉, 这个密码看着不太对, 请再试试.
wrong_hash_message: 抱歉, 这个文章不能被校验, 不过您还是能看看解密后的内容.
---

```

### `_config.yml`

#### 示例

```yaml

# Security
encrypt: # hexo-blog-encrypt
  abstract: 有东西被加密了, 请输入密码查看.
  message: 您好, 这里需要密码.
  tags:
  - {name: tagName, password: 密码A}
  - {name: tagName, password: 密码B}
  template: <div id="hexo-blog-encrypt" data-wpm="{{hbeWrongPassMessage}}" data-whm="{{hbeWrongHashMessage}}"><div class="hbe-input-container"><input type="password" id="hbePass" placeholder="{{hbeMessage}}" /><label>{{hbeMessage}}</label><div class="bottom-line"></div></div><script id="hbeData" type="hbeData" data-hmacdigest="{{hbeHmacDigest}}">{{hbeEncryptedData}}</script></div>
  wrong_pass_message: 抱歉, 这个密码看着不太对, 请再试试.
  wrong_hash_message: 抱歉, 这个文章不能被校验, 不过您还是能看看解密后的内容.

```

### 配置优先级

文章信息头 > `_config.yml` (站点根目录下的) > 默认配置

### 关于 Callback 函数
在部分博客中, 解密后部分元素可能无法正常显示或者表现, 这属于已知问题. 目前的解决办法是通过自行查阅自己的博客中的代码, 了解到在 onload 事件发生时调用了哪些函数, 并将这些函数挑选后写入到博客内容中. 如:

```
---
title: Callback Test
date: 2019-12-21 11:54:07
tags:
    - Encrypted
---

This is a blog to test Callback functions. You just need to add code at the last of your post like following:

It will be called after the blog decrypted.

<script>
    // 添加一个 script tag 与代码在文章末尾.
    alert("Hello World");
</script>
```

例子在: [Callback 例子](https://mhexo.github.io/2019/12/21/CallbackTest/).

### 对 TOC 进行加密

如果你有一篇文章使用了 TOC，你需要修改模板的部分代码。这里用 landscape 作为例子：

+ 你可以在 hexo/themes/landscape/layout/_partial/article.ejs 找到 article.ejs。
+ 然后找到 <% post.content %> 这段代码，通常在30行左右。
+ 使用如下的代码来替代它:

```
<% if(post.toc == true){ %>
  <div id="toc-div" class="toc-article" <% if (post.encrypt == true) { %>style="display:none" <% } %>>
    <strong class="toc-title">Index</strong>
      <% if (post.encrypt == true) { %>
        <%- toc(post.origin, {list_number: true}) %>
      <% } else { %>
        <%- toc(post.content, {list_number: true}) %>
      <% } %>
  </div>
<% } %>
<%- post.content %>
```

## 许可

看看 [LICENSE](./LICENSE).

## 感谢

Collaborator - [xiazeyu](https://github.com/xiazeyu)
