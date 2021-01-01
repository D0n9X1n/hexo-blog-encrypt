# hexo-blog-encrypt

![GitHub release (latest SemVer including pre-releases)](https://img.shields.io/github/v/release/D0n9x1n/hexo-blog-encrypt?include_prereleases)
[![Build Status](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/build.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/build-status/master)
[![Scrutinizer Code Quality](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/quality-score.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/?branch=master)

[中文说明](./ReadMe.zh.md)

## What's this

- ~~First of all, the **BEST** post encryption plugin in the universe for hexo.(But what about the other plugins?)~~

- It is for those who write a post, but don't want everyone to read it. Thus, password is required in certain pages to access these encrypted posts.

- Encryption is simple on wordpress, emlog or other blog systems, except hexo. :(

- So it's "hexo-blog-encrypt"'s time.

## Features

- Once you enter the correct password, you can get the access to encrypted posts, and the password is remembered locally. Press the button again, and the stored password will be erased. If there're scripts in the post, they will be executed once the post is decrypted.

- Support preset tag-specified password.

- All functions are provided by the native APIs. We use [Crypto](https://nodejs.org/dist/latest-v12.x/docs/api/crypto.html) in Node.js, and use [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) in Browsers.

- [PBKDF2](https://tools.ietf.org/html/rfc2898), [SHA256](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf) is used to derive keys, We use [AES256-CBC](https://csrc.nist.gov/publications/detail/sp/800-38a/final) to encrypt and decrypt data, we also use [HMAC](https://csrc.nist.gov/csrc/media/publications/fips/198/1/final/documents/fips-198-1_final.pdf) to verify message authentication codes to make sure the posts are decrypted well and not modified.

- Promise is widely used to make sure our main procedures are asynchronous, so that there is little chance for the process to be blocked, and the experience will be more fluent.

- Template theme supported, you can use [`default`, `blink`, `flip`, `shrink`, `surge`, `up`, `wave`, `xray`] to set up your template theme, and [CHECK ONLINE](https://mhexo.github.io/tags/ThemeTests/).

- Outdated browsers may not work well. In such case, please upgrade your browser.

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
password: hello
---

```

- Then use `hexo clean && hexo g && hexo s` to see your encrypted post locally.

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
  wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
  wrong_hash_message: Oh, these decrypted content cannot be verified, but you can still have a look.

```

#### To disable tag encryption

Just set the `password` property in front matter to `""`.

Example:

```
---
title: Callback Test
date: 2019-12-21 11:54:07
tags:
    - A Tag should be encrypted
password: ""
---

Use a "" to disable tag encryption.
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

This is a blog to test Callback functions. You just need to add code at the end of your post as follows:

It will be called after the blog is decrypted.

<script>
    // add script tag and code at the end of your post
    alert("Hello World");
</script>
```

Demo: [Callback Example](https://mhexo.github.io/2019/12/21/CallbackTest/).

### Encrypt TOC

If you has a post with TOC, you should change the code of your template. Take the default theme 'landscape' as an example:

+ You should find the `article.ejs` file located at `hexo/themes/landscape/layout/_partial/article.ejs`.
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

### Disable logging
If you want to disable the logging, you can add a silent property in `_config.yml` and set it to true.

```yaml
# Security
encrypt: # hexo-blog-encrypt
  silent: true
```

This would disable the logging like `INFO  hexo-blog-encrypt: encrypting "{Blog Name}" based on Tag: "EncryptedTag".`.

### Encrypt Theme
Previously, we use `template` to let users modify their own themes. Turn out that it's not a simple way. So, we are introducing this feature here.

You can simply use `theme` in `_config.yml` or in header like:

#### In post's front matter

```markdown
---
title: Theme test
date: 2019-12-21 11:54:07
tags:
    - A Tag should be encrypted
theme: xray
password: "hello"
---
```

#### In `_config.yml`

This would be a default one.

```yaml
# Security
encrypt: # hexo-blog-encrypt
  abstract: Here's something encrypted, password is required to continue reading.
  message: Hey, password is required here.
  tags:
  - {name: encryptAsDiary, password: passwordA}
  - {name: encryptAsTips, password: passwordB}
  theme: xray
  wrong_pass_message: Oh, this is an invalid password. Check and try again, please.
  wrong_hash_message: Oh, these decrypted content cannot be verified, but you can still have a look.

```

Check them online, and PICK one:

+ [default](https://mhexo.github.io/2020/12/23/Theme-Test-Default/)
+ [blink](https://mhexo.github.io/2020/12/23/Theme-Test-Blink/)
+ [shrink](https://mhexo.github.io/2020/12/23/Theme-Test-Shrink/)
+ [flip](https://mhexo.github.io/2020/12/23/Theme-Test-Flip/)
+ [up](https://mhexo.github.io/2020/12/23/Theme-Test-Up/)
+ [surge](https://mhexo.github.io/2020/12/23/Theme-Test-Surge/)
+ [wave](https://mhexo.github.io/2020/12/23/Theme-Test-Wave/)
+ [xray](https://mhexo.github.io/2020/12/23/Theme-Test-Xray/)


## License

See [LICENSE](./LICENSE) file.

## Thanks

Collaborator - [xiazeyu](https://github.com/xiazeyu)
