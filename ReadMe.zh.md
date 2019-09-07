# hexo-blog-encrypt

[![npm version](https://badge.fury.io/js/hexo-blog-encrypt.svg)](https://badge.fury.io/js/hexo-blog-encrypt)
[![Build Status](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/build.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/build-status/master)
[![Scrutinizer Code Quality](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/badges/quality-score.png?b=master)](https://scrutinizer-ci.com/g/MikeCoder/hexo-blog-encrypt/?branch=master)

[English ReadMe](./ReadMe.md)

> 提 issue 前请学会如何总结归纳，请不要直接一句话描述问题，除非问题十分明确。可以参考这几个 issue: [#79](https://github.com/MikeCoder/hexo-blog-encrypt/issues/79), [#68](https://github.com/MikeCoder/hexo-blog-encrypt/issues/68), [#83](https://github.com/MikeCoder/hexo-blog-encrypt/issues/83), [#21](https://github.com/MikeCoder/hexo-blog-encrypt/issues/21)

## 什么是 Hexo-Blog-Encrypt

> 尝试着想一下，你写了一篇博客，但是，出于某种原因，不太希望每一个人都可以看到他。所以你常常会为这种文章设置一个密码，其他人需要输入密码才可以访问这篇博客。对于 emlog 或者 wordpress 来说，这很容易，但是对于 hexo 来说，之前并没有一个类似的功能。
> 所以，Hexo-Blog-Encrypt 因为这个需求而诞生了。

## 特点

- 一旦你输入了正确的密码，你可以在接下来的 30 分钟内，无需密码访问该网页。

## 线上 Demo

你可以查看 [Demo Page](https://mhexo.github.io/).

## 安装

- `npm install --save hexo-blog-encrypt`

- 或者 `yarn add hexo-blog-encrypt` (需要安装 [Yarn](https://yarnpkg.com/en/))

## 快速开始

- 首先, 你需要确保你的文章中含有内容（不能为空，或者只包含空格）
- 然后在 `_config.yml` 中启用该插件:
- 文章设置的password优先级最高，其次是设置标签加密，文章多标签加密密码优先级跟文章标签先后顺序有关

```yaml

# Security
encrypt: # hexo-blog-encrypt
  enable: true
  tags:  # 配置标签加密
    - {name: test, password: test}
    - {name: diary, password: diary}

```

- 然后在你的文章的头部添加上对应的字段，如 password, abstract, message

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: mikemessi
abstract: Something was encrypted, please enter password to read.
message: Welcome to my blog, please enter password to read.
---

```

- 如果你想对 TOC 也进行加密，则在 article.ejs 中将 TOC 的生成代码修改成如下：

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

- 然后使用 *hexo clean && hexo g && hexo s*，来查看效果。

## 具体的使用方法

### 首先，你需要在 _config.yml 中启用该插件

```yaml

# Security
encrypt: # hexo-blog-encrypt
  enable: true
  tags:   # 配置标签加密
    - {name: test, password: test}
    - {name: diary, password: diary}

```

### 给文章添加密码

```markdown

---
title: Hello World
date: 2016-03-30 21:18:02
password: mikemessi
abstract: Something was encrypted, please enter password to read.
message: Welcome to my blog, enter password to read.
---

```

- password: 是该博客加密使用的密码
- abstract: 是该博客的摘要，会显示在博客的列表页
- message: 这个是博客查看时，密码输入框上面的描述性文字

### 对 TOC 进行加密

如果你有一篇文章使用了 TOC，你需要修改模板的部分代码。这里用 landscape 作为例子：

- 你可以在 *hexo/themes/landscape/layout/_partial/article.ejs* 找到 article.ejs。
- 然后找到 <% post.content %> 这段代码，通常在30行左右。
- 使用如下的代码来替代它:

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

### 修改加密模板

- 如果你对默认的主题不满意，或者希望修改默认的提示和摘要内容，你可以添加如下配置在 *_config.yml* 中。

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

- 可以看见，和上面的配置文件对比来看，多了 **default_template** 和 **default_abstract**  和 **default_message** 配置项。
  - default_abstract : 这个是指在文章列表页，我们看到的加密文章描述。当然这是对所有加密文章生效的。
  - default_message : 这个在文章详情页的密码输入框上方的描述性文字。
  - default_template : 这个是指在文章详情页，我们看到的输入密码阅读的模板，同理，这个也是针对所有文章的
    - 开始的解密部分需要由 div 包裹，而且 div 的 id **必须** 是 'hbe-security'，解密后以便于隐藏。
    - 最后的 content 显示 div 的 id **必须** 是 'encrypt-blog'，同时为了好看，也希望进行隐藏。
    - 同时，必须要有一个 input 输入框，id **必须**是"pass"，用来供用户输入密码。
    - 输入密码之后，务必要有一个触发器，用来调用 'decryptAES' 函数。样例中以 button 来触发。

- 如果你希望对某一篇特定的文章做特殊处理，这有两种方法可以达到这个效果, 在博客的源文件添加 template 配置:

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

## 回调

如果您需要在文章解密之后调用一些代码，您可以参考以下配置：

```yaml

encrypt:
  enable: true
  callback: |-
    initLightGallery()
    initImageResize()
    initTocBot()

```

> 在`callback` 之后的这个符号`|-`代表多行的yaml值

如果您在其他js文件里面定义了函数，您可以在这里调用它们，或者您也可以在`callback`这里写上您自己的代码逻辑，比如`$('#someId').lightGallery()`，上面的`initXXX()`只是示例，您不应该直接复制上面的配置。

## TODO

See [TODO](./TODO.md) File

## License

See [LICENSE](./LICENSE) File.

## Thanks

Collaborator - [xiazeyu](https://github.com/xiazeyu)
