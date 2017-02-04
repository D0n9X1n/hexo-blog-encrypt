// Copyright © 2016 TangDongxin

// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
// OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
// OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


var fs = require('hexo-fs');
var pathFn = require('path');
var CryptoJS = require("crypto-js");

hexo.extend.filter.register("after_post_render", function (data) {
    // close the encrypt function
    if (!('encrypt' in hexo.config && hexo.config.encrypt && 'enable' in hexo.config.encrypt && hexo.config.encrypt.enable)) {
        return data;
    }
    if (!('default_template' in hexo.config.encrypt && hexo.config.encrypt.default_template)) { // no such template
        hexo.config.encrypt.default_template = '<link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap.min.css"> <link rel="stylesheet" href="//cdn.bootcss.com/bootstrap/3.3.5/css/bootstrap-theme.min.css"> <script src="//cdn.bootcss.com/jquery/1.11.3/jquery.min.js"></script> <script src="//cdn.bootcss.com/bootstrap/3.3.5/js/bootstrap.min.js"></script> <div id="security"> <div> <div class="input-group"> <input type="text" class="form-control" aria-label="Enter the password." id="pass"/> <div class="input-group-btn"> <button type="button" class="btn btn-default" onclick="decryptAES()">Decrypt</button> </div> </div> </div> </div> <div id="encrypt-blog" style="display:none"> {{content}} </div>';
    }
    if (!('default_abstract' in hexo.config.encrypt && hexo.config.encrypt.default_abstract)) { // no read more info
        hexo.config.encrypt.default_abstract = 'The article has been encrypted, please enter your password to view.<br>';
    }
    if (!('default_message' in hexo.config.encrypt && hexo.config.encrypt.default_message)) { // no message
        hexo.config.encrypt.default_message = 'Please enter the password to read the blog.';
    }

    if ('password' in data && data.password) {
        // use the blog's config first
        console.log('encrypt the blog :' + data.title.trim());

        // store the origin data
        data.origin = data.content;
        data.encrypt = true;

        if (!('abstract' in data && data.abstract)) {
            data.abstract = hexo.config.encrypt.default_abstract;
        }
        if (!('template' in data && data.template)) {
            data.template = hexo.config.encrypt.default_template;
        }
        if (!('message' in data && data.message)) {
            data.message = hexo.config.encrypt.default_message;
        }

        data.content = escape(data.content);
        data.content = CryptoJS.enc.Utf8.parse(data.content);
        data.content = CryptoJS.enc.Base64.stringify(data.content);
        data.content = CryptoJS.AES.encrypt(data.content, String(data.password)).toString();
        data.content = data.template.replace('{{content}}', data.content);
        data.content = '<h3 id="encrypt-message">' + data.message + '</h3>' + data.content;
        data.content = '<script src="' + hexo.config.root + 'mcommon.js"></script>' + data.content;
        data.content = '<script src="' + hexo.config.root + 'crypto-js.js"></script>' + data.content;

        data.more = data.abstract;
        data.excerpt = data.more;
    } else {
        // no blogs config
        if (!'blogs' in hexo.config.encrypt || !hexo.config.encrypt.blogs) {
            return data;
        }
        for (var i = 0, len = hexo.config.encrypt.blogs.length; i < len; i++) {
            if ('blogs' in hexo.config.encrypt && data.title.trim() == hexo.config.encrypt.blogs[i].title.trim()) {
                console.log('encrypt the blog :' + data.title.trim());

                // store the origin data
                data.origin = data.content;
                data.encrypt = true;

                if (!hexo.config.encrypt.blogs[i].abstract) {
                    hexo.config.encrypt.blogs[i].abstract = hexo.config.encrypt.default_abstract;
                }
                if (!hexo.config.encrypt.blogs[i].template) {
                    hexo.config.encrypt.blogs[i].template = hexo.config.encrypt.default_template;
                }
                if (!hexo.config.encrypt.blogs[i].message) {
                    hexo.config.encrypt.blogs[i].message = hexo.config.encrypt.default_message;
                }

                data.content = escape(data.content);
                data.content = CryptoJS.enc.Utf8.parse(data.content);
                data.content = CryptoJS.enc.Base64.stringify(data.content);
                data.content = CryptoJS.AES.encrypt(data.content, hexo.config.encrypt.blogs[i].password).toString();
                data.content = hexo.config.encrypt.blogs[i].template.replace('{{content}}', data.content);
                data.content = '<h3 id="encrypt-message">' + hexo.config.encrypt.blogs[i].message + '</h3>' + data.content;
                data.content = '<script src="' + hexo.config.root + 'mcommon.js"></script>' + data.content;
                data.content = '<script src="' + hexo.config.root + 'crypto-js.js"></script>' + data.content;

                data.more = hexo.config.encrypt.blogs[i].abstract;
                data.excerpt = data.more;
            }
        }
    }
    return data;
});

hexo.on('exit', function() {
    var mcommonjs = pathFn.join(pathFn.join(pathFn.join(pathFn.join(hexo.base_dir, 'node_modules'), 'hexo-blog-encrypt'), 'lib'), 'mcommon.js');
    fs.readFile(mcommonjs).then(function(content) {
        fs.copyFile(mcommonjs, pathFn.join(hexo.public_dir, 'mcommon.js'));
    });

    var corejs = pathFn.join(pathFn.join(pathFn.join(pathFn.join(hexo.base_dir, 'node_modules'), 'hexo-blog-encrypt'), 'lib'), 'crypto-js.js');
    fs.readFile(corejs).then(function(content) {
        fs.copyFile(corejs, pathFn.join(hexo.public_dir, 'crypto-js.js'));
    });
});

