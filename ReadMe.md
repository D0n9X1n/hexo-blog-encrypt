# hexo-blog-encrypt

[![npm version](https://badge.fury.io/js/hexo-blog-encrypt.svg)](https://badge.fury.io/js/hexo-blog-encrypt)
[![Build Status](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/build.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/build-status/master)
[![Scrutinizer Code Quality](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/quality-score.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/?branch=master)

[中文说明](./ReadMe.zh.md)

## What is Hexo Blog Encrypt

> Think about this, you write an article, but not want everyone to read. So you will add a passwrod on the blog, others need to answer the password to access the blog.
> It is easy on wordpress or emlog or other blog system. However, when you on hexo, there is no such a plugin or function before.
> Now let me introduce my plugin "hexo-blog-encrypt".

## Feature

+ Once you enter the correct password, you can get the access for 30 minutes.

## Live Demo

See [Demo Page](https://mhexo.github.io/). 

## Install

+ `npm install --save hexo-blog-encrypt`

+ or `yarn add hexo-blog-encrypt` (require [Yarn](https://yarnpkg.com/en/))

## Quick Start

+ First, make sure your post has content(not empty, or only has space).
+ Then you should enable the plugin in your `_config.yml` like below:
+ The password in post is the highest priority, and then in tags encryption setting. The password priority in the post with multi-tag encryption is ordered by the post tags.

```yaml

# Security
encrypt: # hexo-blog-encrypt
  enable: true
  tags:  # encrypt posts by tags with the password separately
    - {name: test, password: test}
    - {name: diary, password: diary}

```

+ Add password and abstract and message to your blog source like below:

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: mikemessi
abstract: Something was encrypted, please enter password to read.
message: Welcome to my blog, please enter password to read.
---

```

+ If you want to encrypt you TOC of the blog, you should add the following code to your article.ejs:

```ejs

<% if(post.toc == true){ %>
  <div id="toc-div" class="toc-article" <% if (post.encrypt == true) { %>style="display:none" <% } %>>
    <strong class="toc-title">Index</strong>
      <% if (post.encrypt == true) { %>
        <%- toc(post.origin) %>
      <% } else { %>
        <%- toc(post.content) %>
      <% } %>
  </div>
<% } %>
<%- post.content %>

```

+ Then use `hexo clean && hexo g && hexo s` to see your blog.

## For Advanced Users

### First you should enable the plugin in your _config.yml like below

```yaml

# Security
encrypt: # hexo-blog-encrypt
  enable: true
  tags:  # encrypt posts by tags with the password separately
    - {name: test, password: test}
    - {name: diary, password: diary}

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

## callback

In case that you would like to invoke some code after blog content is decrypted, you can add one config as below demo:

```yaml

encrypt:
  enable: true
  callback: |-
    initLightGallery()
    initImageResize()
    initTocBot()

```

> the symbol `|-` after `callback` means multi-line value.

You should write your own js code here, some functions if you defined it elsewhere, do not just copy the code like `initXXXX()`

## TODO

See [TODO](./TODO.md) file.

## License

See [LICENSE](./LICENSE) file.

## Thanks

Collaborator - [xiazeyu](https://github.com/xiazeyu)
