/* global hexo, __dirname */

'use strict';

const crypto = require('crypto');
const fs = require('hexo-fs');
const log = require('hexo-log')({
  'debug': false,
  'slient': false,
});
const path = require('path');

const defaultConfig = {
  'abstract': 'Here\'s something encrypted, password is required to continue reading.',
  'prompt': 'Hey, password is required here.',
  'template': fs.readFileSync(path.resolve(__dirname, './lib/template.html')).toString(),
  'wrong_pass_message': 'Oh, this is an invalid password. Check and try again, please.',
  'wrong_hash_message': 'Oh, these decrypted content cannot be verified, but you can still have a look.',
};

const keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
const ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');

function textToArray(s) {
  var i = s.length;
  var n = 0;
  var ba = new Array()
  for (var j = 0; j < i;) {
    var c = s.codePointAt(j);
    if (c < 128) {
      ba[n++] = c;
      j++;
    }
    else if ((c > 127) && (c < 2048)) {
      ba[n++] = (c >> 6) | 192;
      ba[n++] = (c & 63) | 128;
      j++;
    }
    else if ((c > 2047) && (c < 65536)) {
      ba[n++] = (c >> 12) | 224;
      ba[n++] = ((c >> 6) & 63) | 128;
      ba[n++] = (c & 63) | 128;
      j++;
    }
    else {
      ba[n++] = (c >> 18) | 240;
      ba[n++] = ((c >> 12) & 63) | 128;
      ba[n++] = ((c >> 6) & 63) | 128;
      ba[n++] = (c & 63) | 128;
      j += 2;
    }
  }
  return new Uint8Array(ba);
}

hexo.extend.filter.register('after_post_render', (data) => {

  const tagEncryptName = [];
  const tagEncryptPass = [];
  let password = data.password;

  if(('encrypt' in hexo.config) && ('tags' in hexo.config.encrypt)){
    hexo.config.encrypt.tags.forEach((tagObj) => {
      tagEncryptName.push(tagObj.name);
      tagEncryptPass.push(tagObj.password);
    });
  }

  data.tags.forEach((cTag, index) => {
    if(tagEncryptName.includes(cTag.name)){
      password = password || tagEncryptPass[index];
    }
  });
  
  if(password === undefined){
    return data;
  }
  password = password.toString();

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

  log.info(`hexo-blog-encrypt: encrypting "${data.title.trim()}".`);

  const key = crypto.pbkdf2Sync(password, keySalt, 1024, 256/8, 'sha256');
  const iv = crypto.pbkdf2Sync(password, ivSalt, 512, 16, 'sha256');

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

hexo.extend.generator.register('hexo-blog-encrypt', () => [
  {
    'data': () => fs.createReadStream(path.resolve(__dirname, './lib/blog-encrypt.css')),
    'path': 'css/blog-encrypt.css',
  },
  {
    'data': () => fs.createReadStream(path.resolve(__dirname, './lib/blog-encrypt.js')),
    'path': 'lib/blog-encrypt.js',
  },
]);
