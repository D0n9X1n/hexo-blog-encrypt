/* global hexo, __dirname */

'use strict';

const fs = require('hexo-fs');
const path = require('path');
const CryptoJS = require('crypto-js');

hexo.extend.filter.register('after_post_render', function encrypt (data) {

  // Close the encrypt function
  if (!('encrypt' in hexo.config && hexo.config.encrypt && 'enable' in hexo.config.encrypt && hexo.config.encrypt.enable)) {

    return data;

  }
  if (!('default_template' in hexo.config.encrypt && hexo.config.encrypt.default_template)) { // No such template

    hexo.config.encrypt.default_template = fs.readFileSync('./template.html', 'utf8');

  }
  if (!('default_abstract' in hexo.config.encrypt && hexo.config.encrypt.default_abstract)) { // No read more info

    hexo.config.encrypt.default_abstract = 'The article has been encrypted, please enter your password to view.<br>';

  }
  if (!('default_message' in hexo.config.encrypt && hexo.config.encrypt.default_message)) { // No message

    hexo.config.encrypt.default_message = 'Please enter the password to read the blog.';

  }

  if ('password' in data && data.password) {

    // Use the blog's config first
    console.log(`encrypt the blog :${ data.title.trim() }`);

    // Store the origin data
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
    // Console.log(data.content);
    data.template = data.template.replace('{{content}}', data.content);
    data.template = data.template.replace('{{message}}', data.message);
    data.template = data.template.replace('{{message}}', data.message);

    data.content = data.template;
    data.content += `<script src="${hexo.config.root}lib/blog-encrypt.js"></script>
<script src="${hexo.config.root}lib/crypto-js.js"></script>'
<link href="${hexo.config.root}css/blog-encrypt.css" rel="stylesheet" type="text/css">`;

    data.more = data.abstract;
    data.excerpt = data.more;

  }
  return data;

});

hexo.extend.generator.register('blog-encrypt', () => [
  {
    'data': () => fs.createReadStream(path.resolve(path.dirname(require.resolve('crypto-js')), 'crypto-js.js')),
    'path': 'lib/blog-encrypt.js',
  }, {
    'data': () => fs.createReadStream(path.resolve(__dirname, 'lib/blog-encrypt.js')),
    'path': 'lib/blog-encrypt.js',
  }, {
    'data': () => fs.createReadStream(path.resolve(__dirname, 'lib/blog-encrypt.css')),
    'path': 'lib/blog-encrypt.css',
  },
]);
