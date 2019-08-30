# hexo-blog-encrypt

[![npm version](https://badge.fury.io/js/hexo-blog-encrypt.svg)](https://badge.fury.io/js/hexo-blog-encrypt)
[![Build Status](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/build.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/build-status/master)
[![Scrutinizer Code Quality](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/quality-score.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/?branch=master)

[中文说明](./ReadMe.zh.md)

## What is Hexo-blog-encrypt

- ~~First of all, the **BEST** post encryption plugin in the universe for hexo.(But what about the other plugins?)~~

- It is for who wrote a post, but don't want everyone to read. Thus, password is required in certain pages to access these encrypted posts.

- It is simple on wordpress, emlog or other blog system, except hexo. :(

- So it's "hexo-blog-encrypt"'s time.

## Feature

- Once you enter the correct password, you can get the access to read encrypted posts, and the password is remembered at local. Press the button once, and the stored password will be erased. If there're scripts in the post, they will be executed once the post is decrypted.

- All functions are provided by the native APIs. We use [Crypto](https://nodejs.org/dist/latest-v12.x/docs/api/crypto.html) in Node.js, and use [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) in Browsers.

- [PBKDF2](https://tools.ietf.org/html/rfc2898), [SHA256](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) is used to derive keys, We use [AES256-CBC](https://csrc.nist.gov/publications/detail/sp/800-38a/final) to encrypt and decrypt data, we also use [HMAC](https://csrc.nist.gov/csrc/media/publications/fips/198/1/final/documents/fips-198-1_final.pdf) to verify message authentication codes to make sure the posts are decrypted well and not modified.

- Promise is widely used to make sure our main procedures are asynchronous, so that the process have little chances to be block, and the experience will be more fluent.

- Outdatad browsers may not work well. In such case, please upgrade your browser.

## Live Demo

- See [Demo Page](https://mhexo.github.io/example-site/2018/06/25/encrypt-test/), **all passwords are `123`**.

## Install

- `npm install --save hexo-blog-encrypt`

- or `yarn add hexo-blog-encrypt` (require [Yarn](https://yarnpkg.com/en/))

## Quick Start

- Add password to your post's head like this:

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: mikemessi
---

```

- Then use `hexo clean && hexo g && hexo s` to see your blog at local.

## Advanced settings

You 

```

### Then, add password to the blogs

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: mikemessi
abstract: Something was encrypted, please enter password to read.
message: Welcome to my blog, enter password to read.
---

```

As we can see above, we add 'password, abstract, message' the new 3 items in the blog info block.

+ password is the blog password.
+ abstract is the content which will be showed in the blog list page.
+ message is the content which will be showed in the blog detail page.

### Encrypt TOC

If you has a post with TOC, you should change the code of template. Use the default theme 'landscape' as an example:

+ You should find the *article.ejs* file which is located in *hexo/themes/landscape/layout/_partial/article.ejs*.
+ Find the code like <% post.content %>, which is usually at line 30.
+ Replace the <% post.content %> with the following code block:

```ejs

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

### Change Template

If you are not satisfied with the default template, you can just change it to your favorite one. Just follow the following steps.

```yaml

# Security
encrypt: # hexo-blog-encrypt
  enable: true
    default_abstract: Something was encrypted, please enter password to read.</br>
    default_message: Welcome to my blog, enter password to read.
    default_template: |-
        <div id="hbe-security">
          <div class="hbe-input-container">
          <input type="password" class="hbe-form-control" id="pass" placeholder="{{message}}" />
            <label for="pass">{{message}}</label>
            <div class="bottom-line"></div>
          </div>
        </div>
        <div id="decryptionError" style="display:none;">{{decryptionError}}</div>
        <div id="noContentError" style="display:none;">{{noContentError}}</div>
        <div id="encrypt-blog" style="display:none">
        {{content}}
        </div>

```

+ You can see **default_abstract** and **default_template** and **default_message** here.
  + default_abstract: means the default description which will be shown on the blogs list page.
  + default_message: means the default message will show above the password input area.
  + default_template : means the default detail page which will be shown on the detial page.
    + the decryption div's id **must** be 'hbe-security'
    + the content div's id **must** be 'encrypt-blog'
    + there must be a input's id **must** be pass, which will let reader to input their password
    + there must be trigger which calls the 'decryptAES' function

If you want to make the blog special, You can add abstract and template to your blog files, like these:

```markdown

---
title: hello world
date: 2016-03-30 21:18:02
password: Mike
abstract: Welcome to my blog, enter password to read.
message: Welcome to my blog, enter password to read.
template:
        <div id="hbe-security">
          <div class="hbe-input-container">
          <input type="password" class="hbe-form-control" id="pass" placeholder="{{message}}" />
            <label for="pass">{{message}}</label>
            <div class="bottom-line"></div>
          </div>
        </div>
        <div id="decryptionError" style="display:none;">{{decryptionError}}</div>
        <div id="noContentError" style="display:none;">{{noContentError}}</div>
        <div id="encrypt-blog" style="display:none">
        {{content}}
        </div>
---

```

The plugin will use the template content instead of the default one.

## License

See [LICENSE](./LICENSE) file.

## Thanks

Collaborator - [xiazeyu](https://github.com/xiazeyu)
