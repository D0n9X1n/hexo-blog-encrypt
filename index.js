/* global hexo, __dirname */

'use strict';

const crypto = require('crypto');
const fs = require('hexo-fs');
const log = require('hexo-log')({
  'debug': false,
  'slient': false,
});
const path = require('path');
const UglifyJS = require('uglify-js');

const defaultConfig = {
  'abstract': 'Here\'s something encrypted, password is required to continue reading.',
  'prompt': 'Hey, password is required here.',
  'template': fs.readFileSync(path.resolve(__dirname, './lib/template.html')).toString(),
  'wrong_pass_message': 'Oh, this is an invalid password. Check and try again, please.',
  'wrong_hash_message': 'Oh, these decrypted content cannot be verified, but you can still have a look.',
};
const keySalt = new Uint8Array(Array.from('hexo-blog-encrypt的作者(们)都是大帅比!'));
const ivSalt = new Uint8Array(Array.from('hexo-blog-encrypt是地表最强Hexo加密插件!'));

hexo.extend.filter.register('after_post_render', (data) => {

  if(!('password' in data)){
    return data;
  }

  // Let's rock n roll
  const config = Object.assign(defaultConfig, hexo.config.encrypt, data);

  // --- Begin --- Remove in the next version please
  const deprecatedConfigs = [
    'default_template',
    'default_abstract',
    'default_message',
    'default_decryption_error',
    'default_no_content_error',
  ];
  const newKeyNames = [
    'template',
    'abstract',
    'prompt',
    'wrong_pass_message',
    'wrong_hash_message',
  ]
  deprecatedConfigs.forEach((key, index) => {
    if(key in config){
      log.warn(`hexo-blog-encrypt: ${key} is DEPRECATED, please change to newer API.`);
      config[newKeyNames[index]] = config[key];
    }
  });

  // --- End --- Remove in the next version please

  log.info(`hexo-blog-encrypt: encrypt blog ${data.title.trim()}`);

  const key = crypto.pbkdf2Sync(config.password, keySalt, 256, 256/8, 'sha256');
  const iv = crypto.pbkdf2Sync(config.password, ivSalt, 128, 16, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const hmac = crypto.createHmac('sha256', key);

  let encryptedData = cipher.update(data.content, 'utf8', 'hex');
  hmac.update(data.content, 'utf8');
  encryptedData += cipher.final('hex');
  const hmacDigest = hmac.digest('hex');

  data.content = config.template.replace(/{{hbeEncryptedData}}/g, encryptedData)
  .replace(/{{hbeHmacDigest}}/g, hmacDigest)
  .replace(/{{hbeWrongPassMessage}}/g, config.wrong_pass_message)
  .replace(/{{hbeWrongHashMessage}}/g, config.wrong_hash_message)
  .replace(/{{hbePrompt}}/g, config.prompt);
  data.content += `<script src="${hexo.config.root}lib/blog-encrypt.js"></script><link href="${hexo.config.root}css/blog-encrypt.css" rel="stylesheet" type="text/css">`;
  data.excerpt = data.more = config.abstract;

  return data;

})

const code = fs.readFileSync(path.resolve(__dirname, './lib/blog-encrypt.js')).toString();
const result = UglifyJS.minify(code, {
  'sourceMap': {
    'filename': 'blog-encrypt.js',
    'url': 'blog-encrypt.js.map',
  },
});

hexo.extend.generator.register('hexo-blog-encrypt', () => [
  {
    'data': () => fs.createReadStream(path.resolve(__dirname, './lib/blog-encrypt.css')),
    'path': 'css/blog-encrypt.css',
  },
  {
    'data': () => {
      const Readable = require('stream').Readable;
      const stream = new Readable();
      stream.push(result.code, 'utf8');
      stream.push(null);
      return stream;
    },
    'path': 'lib/blog-encrypt.js',
  },
  {
    'data': () => {
      const Readable = require('stream').Readable;
      const stream = new Readable();
      stream.push(result.map, 'utf8');
      stream.push(null);
      return stream;
    },
    'path': 'lib/blog-encrypt.js.map',
  },
]);
