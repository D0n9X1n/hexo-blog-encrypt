Hexo-Blog-Encrypt
===
[![npm version](https://badge.fury.io/js/hexo-blog-encrypt.svg)](https://badge.fury.io/js/hexo-blog-encrypt)

[中文说明](./ReadMe.zh.md)

##What is Hexo Blog Encrypt
> Think about this, you write an article, but not want everyone to read. So you will add a passwrod on the blog, others need to answer the password to access the blog.
> It is easy on wordpress or emlog or other blog system. However, when you on hexo, there is no such a plugin or function before.
> Now let me introduce my plugin "Hexo-Blog-Encrypt".

##Live Demo
See [http://mikecoder.github.io/](http://mikecoder.github.io/2016/03/30/helloworld/)

#Install
+ Add '"hexo-blog-encrypt": "1.0.\*"' to your hexo *package.json*.
+ Then use *npm install*.
+ This plugin will install automatic.

##How to Use

###For easy usage
+ You should add your config in your hexo config file **_config.yml**.
+ Add the following config to **_config.yml**

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

+ It means the blog named **hello world** has been encrypted with the password 'mikemessi'.
+ **Blog's title, it should be the same.**

```
---
title: hello world
date: 2016-03-30 21:18:02
tags:
---
```

###For professional usage
+ You can follow the following config file:

```
# Security
##
encrypt:
    enable: true
    blogs:
        - title: fff
          password: fff

        - title: hello world
          password: mikemessi
          more: 文章已经被加密，请在文章页输入密码查看</br>
          template:
                    <link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap.min.css">
                    <link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap-theme.min.css">
                    <script src="//cdn.bootcss.com/jquery/1.11.3/jquery.min.js"></script>
                    <script src="//cdn.bootcss.com/bootstrap/3.3.5/js/bootstrap.min.js"></script>
                    <div id="security">
                        <h4>密码是 "mikemessi"</h4>
                        <div>
                            <div class="input-group">
                                <input type="text" class="form-control" aria-label="请输入密码" id="pass"/>
                                <div class="input-group-btn">
                                    <button type="button" class="btn btn-default" onclick="decryptAES()">解密</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="encrypt-blog" style="display:none">
                        {{content}}
                    </div>

    default_more: 文章已经被加密，请在文章页输入密码查看</br>
    default_template:
                    <link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap.min.css">
                    <link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap-theme.min.css">
                    <script src="//cdn.bootcss.com/jquery/1.11.3/jquery.min.js"></script>
                    <script src="//cdn.bootcss.com/bootstrap/3.3.5/js/bootstrap.min.js"></script>
                    <div id="security">
                        <h4>请输入密码查看</h4>
                        <div>
                            <div class="input-group">
                                <input type="text" class="form-control" aria-label="请输入密码" id="pass"/>
                                <div class="input-group-btn">
                                    <button type="button" class="btn btn-default" onclick="decryptAES()">解密</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="encrypt-blog" style="display:none">
                        {{content}}
                    </div>
```

+ You can see **default_more** and **default_template** and **more** and **template** here.
    + default_more : means the default description which will be shown on the blogs list page.
    + default_template : means the default detail page which will be shown on the detial page.
    + more : whith means the blog's description you selected will be used instead of the default one.
    + template : it's like more.
        + the content div's id **must** be 'encrypt-blog'
        + there must be a input's id **must** be pass, which will let reader to input their password
        + there must be trigger which calls the 'decryptAES' function

##TODO
See [TODO](./TODO.md) file.

##License
See [LICENSE](./LICENSE) file.
