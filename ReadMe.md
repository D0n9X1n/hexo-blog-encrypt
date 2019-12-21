# hexo-blog-encrypt

[![npm version](https://badge.fury.io/js/hexo-blog-encrypt.svg)](https://badge.fury.io/js/hexo-blog-encrypt)
[![Build Status](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/build.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/build-status/master)
[![Scrutinizer Code Quality](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/quality-score.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/?branch=master)

[中文说明](./ReadMe.zh.md)

## What's this

- ~~First of all, the **BEST** post encryption plugin in the universe for hexo.(But what about the other plugins?)~~

- It is for who wrote a post, but don't want everyone to read. Thus, password is required in certain pages to access these encrypted posts.

- It is simple on wordpress, emlog or other blog system, except hexo. :(

- So it's "hexo-blog-encrypt"'s time.

## Features

- Once you enter the correct password, you can get the access to read encrypted posts, and the password is remembered at local. Press the button once, and the stored password will be erased. If there're scripts in the post, they will be executed once the post is decrypted.

- Support preseted tag-specified password.

- All functions are provided by the native APIs. We use [Crypto](https://nodejs.org/dist/latest-v12.x/docs/api/crypto.html) in Node.js, and use [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) in Browsers.

- [PBKDF2](https://tools.ietf.org/html/rfc2898), [SHA256](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) is used to derive keys, We use [AES256-CBC](https://csrc.nist.gov/publications/detail/sp/800-38a/final) to encrypt and decrypt data, we also use [HMAC](https://csrc.nist.gov/csrc/media/publications/fips/198/1/final/documents/fips-198-1_final.pdf) to verify message authentication codes to make sure the posts are decrypted well and not modified.

- Promise is widely used to make sure our main procedures are asynchronous, so that the process have little chances to be block, and the experience will be more fluent.

- Outdatad browsers may not work well. In such case, please upgrade your browser.

## Online demo

- See [Demo Page](https://mhexo.github.io/), **all passwords are `hello`**.

## Install

- `npm install --save hexo-blog-encrypt`

- or `yarn add hexo-blog-encrypt` (require [Yarn](https://yarnpkg.com/en/))

## Quick start

- Add the "password" value to your post's front matter like:

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: mikemessi
---

```

- Then use `hexo clean && hexo g && hexo s` to see your encrypted post at local.

## Password Priority

post's front matter > encrypt tags

## Advanced settings

### in post's front matter

```markdown

---
title: Hello World
tags:
- encryptAsDiary
date: 2016-03-30 21:12:21
password: mikemessi
abstract: Here's something encrypted, password is required to continue reading.
message: Hey, password is required here.
wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
wrong_hash_message: Oh, these decrypted content cannot be verified, but you can still have a look.
---

```

### In `_config.yml`

#### Example

```yaml

# Security
encrypt: # hexo-blog-encrypt
  abstract: Here's something encrypted, password is required to continue reading.
  message: Hey, password is required here.
  tags:
  - {name: encryptAsDiary, password: passwordA}
  - {name: encryptAsTips, password: passwordB}
  template: <div id="hexo-blog-encrypt" data-wpm="{{hbeWrongPassMessage}}" data-whm="{{hbeWrongHashMessage}}"><div class="hbe-input-container"><input type="password" id="hbePass" placeholder="{{hbeMessage}}" /><label>{{hbeMessage}}</label><div class="bottom-line"></div></div><script id="hbeData" type="hbeData" data-hmacdigest="{{hbeHmacDigest}}">{{hbeEncryptedData}}</script></div>
  wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
  wrong_hash_message: Oh, these decrypted content cannot be verified, but you can still have a look.

```

### Config priority

post's front matter > `_config.yml` (in the root directory) > default

### About Callback
In some blogs, some elements may not be displayed normally after decryption. This is a known issue. The current solution is to check the code in your blog to learn which functions are called when the onload event occurs.
Then write these code at the end of your post. For example:

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
    // add script tag and code at the last of your post
    alert("Hello World");
</script>
```

Demo: [Callback Example](https://mhexo.github.io/2019/12/21/CallbackTest/).

### Encrypt TOC

If you has a post with TOC, you should change the code of template. Use the default theme 'landscape' as an example:

+ You should find the article.ejs file which is located in hexo/themes/landscape/layout/_partial/article.ejs.
+ Find the code like <% post.content %>, which is usually at line 30.
+ Replace the <% post.content %> with the following code block:

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

## License

See [LICENSE](./LICENSE) file.

## Thanks

Collaborator - [xiazeyu](https://github.com/xiazeyu)
