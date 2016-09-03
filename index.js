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
    if (!hexo.config.encrypt.enable) {
        return data;
    }
    if (!hexo.config.encrypt.default_template) { // no such template
        hexo.config.encrypt.default_template = '<div id="security"> <h4>The article has been encrypted, please enter your password to view.</h4> <div> <input id="pass"></input> <input type="button" id="submit" value="decrypt" onclick="decryptAES()"/> </div> </div> <div id="encrypt-blog" style="display:none"> </div>';
    }
    if (!hexo.config.encrypt.default_more) { // no read more info
        hexo.config.encrypt.default_more = 'The article has been encrypted, please enter your password to view.<br>';
    }

    for (var i = 0, len = hexo.config.encrypt.blogs.length; i < len; i++) {
        if (data.title == hexo.config.encrypt.blogs[i].title) {
            if (!hexo.config.encrypt.blogs[i].more) {
                hexo.config.encrypt.blogs[i].more = hexo.config.encrypt.default_more;
            }
            if (!hexo.config.encrypt.blogs[i].template) {
                hexo.config.encrypt.blogs[i].template = hexo.config.encrypt.default_template;
            }
            data.content = escape(data.content);
            data.content = CryptoJS.AES.encrypt(data.content, hexo.config.encrypt.blogs[i].password).toString();
            data.content = hexo.config.encrypt.blogs[i].template.replace('{{content}}', data.content);
            data.content = '<script src="' + hexo.config.root + 'mcommon.js"></script>' + data.content;
            data.content = '<script src="' + hexo.config.root + 'crypto-js.js"></script>' + data.content;

            data.more = hexo.config.encrypt.blogs[i].more;
            data.excerpt = data.more;
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

