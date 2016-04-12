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
    if (!hexo.config.encrypt.enable) {
        return data;
    } // close the encrypt function

    for (var i = 0, len = hexo.config.encrypt.blogs.length; i < len; i++) {
        if (data.title == hexo.config.encrypt.blogs[i].title) {
            console.log(data.content);
            data.content = escape(data.content);
            data.content = CryptoJS.AES.encrypt(data.content, hexo.config.encrypt.blogs[i].password).toString();
            data.content = '<div id="security"><h4>文章已经被加密，请输入密码进行查看。</h4><div><input id="pass"></input><input type="button" id="submit" value="解密" onclick="decryptAES()"></input></div></div><div id="encrypt-blog" style="display:none">' + data.content;
            data.content = '<script src="' + hexo.config.root + 'mcommon.js"></script>' + data.content;
            data.content = '<script src="' + hexo.config.root + 'crypto-js.js"></script>' + data.content;

            data.more = "文章已经被加密，请在文章页输入密码进行查看。";
            data.excerpt = data.more;
        }
    }
    return data;
});

hexo.on('exit', function() {
    var mcommonjs = pathFn.join(pathFn.join(pathFn.join(pathFn.join(hexo.base_dir, 'node_modules'), 'hexo-blog-encrypt'), 'lib'), 'mcommon.js');
    fs.exists(pathFn.join(hexo.public_dir, 'mcommon.js')).then(function (res) {
        console.log(res);
        if (!res) {
            fs.readFile(mcommonjs).then(function(content) {
                fs.copyFile(mcommonjs, pathFn.join(hexo.public_dir, 'mcommon.js'));
            });
        }
    });

    var corejs = pathFn.join(pathFn.join(pathFn.join(pathFn.join(hexo.base_dir, 'node_modules'), 'hexo-blog-encrypt'), 'lib'), 'crypto-js.js');
    fs.exists(pathFn.join(hexo.public_dir, 'crypto-js.js')).then(function (res) {
        console.log(res);
        if (!res) {
            fs.readFile(corejs).then(function(content) {
                fs.copyFile(corejs, pathFn.join(hexo.public_dir, 'crypto-js.js'));
            });
        }
    });
});

