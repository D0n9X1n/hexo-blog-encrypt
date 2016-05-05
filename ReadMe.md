Hexo-Blog-Encrypt
===
[![npm version](https://badge.fury.io/js/hexo-blog-encrypt.svg)](https://badge.fury.io/js/hexo-blog-encrypt)

##What is Hexo Blog Encrypt
> Think about this, you write an article, but not want everyone to read. So you will add a passwrod on the blog, others need to answer the password to access the blog.
> It is easy on wordpress or emlog or other blog system. However, when you on hexo, there is no such a plugin or function before.
> Now let me introduce my plugin "Hexo-Blog-Encrypt".

##Live Demo
See [http://mikecoder.github.io/](http://mikecoder.github.io/2016/03/30/helloworld/)

#Install
+ Add '"hexo-blog-encrypt": "0.0.\*"' to your hexo *package.json*.
+ Then use *npm install*.
+ This plugin will install automatic.

##How to use
+ You should add your config in your hexo config file, such as **_config.yml**.
+ Add the following confit to **_config.yml**

```
# Security
##
encrypt:
    enable: true
    blogs:
        - title: hello world
          password: mikemessi
        - title: fff
          password: fff
```

+ It means the blog named **hello world** has been encrypted.

```
---
title: hello world // This is Title, it should be the same.
date: 2016-03-30 21:18:02
tags:
---
```

##TODO
1. Use template to create the blog page.
2. √ ~~Complete the password checking.~~

##License
See [LICENSE](./LICENSE) File.
