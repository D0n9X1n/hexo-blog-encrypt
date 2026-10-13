'use strict';

// Browser-only messages (the configurable ones — wrong password, prompt,
// button text — come from the server via data-* attributes). Language is
// read from <html lang>: any `zh*` tag gets Chinese, everything else English.

const MESSAGES = {
  en: {
    incompatible: 'hexo-blog-encrypt: this page was built with an incompatible plugin version. ' +
      'Rebuild the site after upgrading the plugin.',
    noCrypto: 'hexo-blog-encrypt: this browser cannot decrypt here because Web Crypto is unavailable. ' +
      'Open the page over HTTPS (or localhost) in an up-to-date browser.',
    forget: 'Forget saved key',
    forgotten: 'Saved key forgotten.',
  },
  zh: {
    incompatible: 'hexo-blog-encrypt: 此页面由插件版本不兼容的构建生成. 升级插件后请重新构建站点.',
    noCrypto: 'hexo-blog-encrypt: Web Crypto 不可用, 当前浏览器无法在此解密. ' +
      '请通过 HTTPS (或 localhost) 使用最新版浏览器打开此页面.',
    forget: '忘记已保存的密钥',
    forgotten: '已忘记保存的密钥.',
  },
};

function messages() {
  const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
  return lang.indexOf('zh') === 0 ? MESSAGES.zh : MESSAGES.en;
}

module.exports = { messages };
