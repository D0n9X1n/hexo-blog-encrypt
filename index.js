/* global hexo, __dirname */

'use strict';

const crypto = require('crypto');
const fs = require('hexo-fs');
const log = require('hexo-log')({ 'debug': false, 'slient': false });
const path = require('path');

const defaultConfig = {
  'abstract': 'Here\'s something encrypted, password is required to continue reading.',
  'message': 'Hey, password is required here.',
  'template': fs.readFileSync(path.resolve(__dirname, './lib/template.html')).toString(),
  'wrong_pass_message': 'Oh, this is an invalid password. Check and try again, please.',
  'wrong_hash_message': 'OOPS, these decrypted content may changed, but you can still have a look.',
};

const keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
const ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');

hexo.extend.filter.register('after_post_render', (data) => {
  const tagEncryptPairs = [];

  let password = data.password;
  let tagUsed = false;

  if (hexo.config.encrypt === undefined) {
    hexo.config.encrypt = [];
  }

  if(('encrypt' in hexo.config) && ('tags' in hexo.config.encrypt)){
    hexo.config.encrypt.tags.forEach((tagObj) => {
      tagEncryptPairs[tagObj.name] = tagObj.password;
    });
  }

  if (data.tags) {
    data.tags.forEach((cTag) => {
      if (tagEncryptPairs.hasOwnProperty(cTag.name)) {
        tagUsed = password ? tagUsed : cTag.name;
        password = password || tagEncryptPairs[cTag.name];
      }
    });
  }

  if(password == undefined){
    return data;
  }

  password = password.toString();

  // make sure toc can work.
  data.origin = data.content;

  // ------------
  // Remove in v3.1.0
  const deprecatedConfigs = [
    'default_template',
    'default_abstract',
    'default_message',
    'default_decryption_error',
    'default_no_content_error',
  ];
  const configKeys = [
    'template',
    'abstract',
    'message',
    'wrong_pass_message',
    'wrong_hash_message',
  ];

  deprecatedConfigs.forEach((key, index) => {
    if(key in hexo.config.encrypt) {
      log.warn(`hexo-blog-encrypt: "${key}" is DEPRECATED, please change to newer API: "${configKeys[index]}"`);
      hexo.config.encrypt[configKeys[index]] = hexo.config.encrypt[key];
    }
  });
  // ------------

  // Let's rock n roll
  const config = Object.assign(defaultConfig, hexo.config.encrypt, data);

  if (tagUsed === false) {
    log.info(`hexo-blog-encrypt: encrypting "${data.title.trim()}" based on the password configured in Front-matter.`);
  } else {
    log.info(`hexo-blog-encrypt: encrypting "${data.title.trim()}" based on Tag: "${tagUsed}".`);
  }

  data.content = data.content.trim();
  data.encrypt = true;

  const key = crypto.pbkdf2Sync(password, keySalt, 1024, 32, 'sha256');
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
    .replace(/{{hbeMessage}}/g, config.message);
  data.content += `<script src="${hexo.config.root}lib/blog-encrypt.js"></script><link href="${hexo.config.root}css/blog-encrypt.css" rel="stylesheet" type="text/css">`;
  data.excerpt = data.more = config.abstract;

  return data;
}, 1000);

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

// Utils functions
function textToArray(s) {
  var i = s.length;
  var n = 0;
  var ba = new Array()

  for (var j = 0; j < i;) {
    var c = s.codePointAt(j);
    if (c < 128) {
      ba[n++] = c;
      j++;
    } else if ((c > 127) && (c < 2048)) {
      ba[n++] = (c >> 6) | 192;
      ba[n++] = (c & 63) | 128;
      j++;
    } else if ((c > 2047) && (c < 65536)) {
      ba[n++] = (c >> 12) | 224;
      ba[n++] = ((c >> 6) & 63) | 128;
      ba[n++] = (c & 63) | 128;
      j++;
    } else {
      ba[n++] = (c >> 18) | 240;
      ba[n++] = ((c >> 12) & 63) | 128;
      ba[n++] = ((c >> 6) & 63) | 128;
      ba[n++] = (c & 63) | 128;
      j += 2;
    }
  }

  return new Uint8Array(ba);
}
