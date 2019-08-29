(() => {
  'use strict';
  const cryptoObj = window.crypto || window.msCrypto;
  const cookieName = 'HBEPASSWORD';
  const keySalt = new Uint8Array(Array.from('hexo-blog-encrypt的作者(们)都是大帅比!'));
  const ivSalt = new Uint8Array(Array.from('hexo-blog-encrypt是地表最强Hexo加密插件!'));
  
  const mainElement = document.getElementById('hexo-blog-encrypt');
  const wrongPassMessage = mainElement.dataset['wpm'];
  const wrongHashMessage = mainElement.dataset['whm'];
  const dataElement = mainElement.getElementsByTagName('script')['hbeData'];
  const encryptedData = dataElement.innerText;
  const HmacDigist = dataElement.dataset['hmacdigest'];

  async function getExecutableScript(oldElem) {

    let out = document.createElement('script');
    const attList = ['type', 'text', 'src', 'crossorigin', 'defer', 'referrerpolicy'];
    attList.forEach((att) => {
      if (oldElem[att])
        out[att] = oldElem[att];
    })

    return out;

  }

  async function convertHTMLToElement(content) {

    let out = document.createElement('div');
    out.innerHTML = content;
    out.querySelectorAll('script').forEach((elem) => {
      elem.replaceWith(await getExecutableScript(elem));
    });

    return out;
  }

  function getKeyMaterial(password) {
    let encoder = new TextEncoder();
    return cryptoObj.subtle.importKey(
      'raw',
      encoder.encode(password),
      {
        'name': 'PBKDF2',
      },
      false,
      [
        'deriveKey',
        'deriveBits',
      ]
    );
  }


  function getHmacKey(keyMaterial) {
    return cryptoObj.subtle.deriveKey({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': keySalt,
      'iterations': 256,
    }, keyMaterial, {
      'name': 'HMAC',
      'hash': 'SHA-256',
      'length': 256/8,
    }, true, [
      'verify',
    ]);
  };getKey(keyMaterial);

  function getDecryptKey(keyMaterial) {
    return cryptoObj.subtle.deriveKey({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': keySalt,
      'iterations': 256,
    }, keyMaterial, {
      'name': 'AES-CBC',
      'length': 256,
    }, true, [
      'decrypt',
    ]);
  }

  function getIv(keyMaterial) {
    return cryptoObj.subtle.deriveBits({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': ivSalt,
      'iterations': 128,
    }, keyMaterial, 16);
  }

  async function verifyContent(key, content){
    const encoder = new TextEncoder();
    const encoded = encoder.encode(content);
    
    let signature = new Uint8Array(HmacDigist.match(/[\da-f]{2}/gi).map((h => {
      return parseInt(h, 16);
    })));
    const result = await cryptoObj.subtle.verify({
      'name': 'HMAC',
      'hash': 'SHA-256',
    }, key, signature, content);
    if(!result){
      alert(wrongHashMessage);
      console.log(e);
      return false;
    }
    return true;
    
  }

  async function decrypt(decryptKey, iv, hmacKey){

    let typedArray = new Uint8Array(encryptedData.match(/[\da-f]{2}/gi).map((h => {
      return parseInt(h, 16);
    })));

    cryptoObj.subtle.decrypt({
      'name': 'AES-CBC',
      'iv': iv,
    }, decryptKey, typedArray.buffer).catch((e) => {
      alert(wrongPassMessage);
      console.log(e);
      return false;
    }).then((result) => {
      const decoder = new TextDecoder();
      document.getElementById('hexo-blog-encrypt').style.display = 'inline';
      document.getElementById('hexo-blog-encrypt').innerHTML = '';
      document.getElementById('hexo-blog-encrypt').appendChild(await convertHTMLToElement(result));
      document.getElementById('hexo-blog-encrypt').style.display = 'none';
      if(document.getElementById('toc-div'))
        document.getElementById('toc-div').style.display = 'inline';
      return await verifyContent(hmacKey, result);
    });

  }

  function setCookie(cookieName, cookieValue, expireMinutes) {

    const expireTime = new Date(new Date().getTime() + 1000 * 60 * expireMinutes);
    return document.cookie = `${cookieName}=${cookieValue}${expireMinutes == null ? '' : `;expires=${expireTime.toGMTString()}`}`;

  }

  function getCookie(cookieName) {

    if (document.cookie.length > 0) {

      let idx = document.cookie.indexOf(`${cookieName}=`);
      if (idx != -1) {

        idx = idx + cookieName.length + 1;
        let idy = document.cookie.indexOf(';', idx);
        if (idy == -1) {

          idy = document.cookie.length;

        }
        return document.cookie.substring(idx, idy);

      }

    }
    return '';

  }

  function GetUrlRelativePath() {

    const url = document.location.toString();
    const arrUrl = url.split('//');

    const start = arrUrl[1].indexOf('/');
    let relUrl = arrUrl[1].substring(start);

    if (relUrl.indexOf('?') != -1) {

      relUrl = relUrl.split('?')[0];

    }
    return relUrl;

  }

  function GenerateCookieName() {

    return hbeCookieName + GetUrlRelativePath();

  }

  function hbeLoader() {
    let keyData = getCookie(GenerateCookieName());

    if(keyData){
      console.log(`Password got from Cookie:${keyData}@${GenerateCookieName()}`);
      let ivArr = new Uint8Array(keyData.iv.match(/[\da-f]{2}/gi).map((h => {
        return parseInt(h, 16);
      })));
      let dkCK = cryptoObj.subtle.importKey('jwk', keyData.dk, {
        'name': 'PBKDF2',
        'hash': 'SHA-256',
        'salt': keySalt,
        'iterations': 256,
      }, true, [
        'verify',
      ]);
      let hmkCK = cryptoObj.subtle.importKey('jwk', keyData.hmk, {
        'name': 'PBKDF2',
        'hash': 'SHA-256',
        'salt': keySalt,
        'iterations': 256,
      }, true, [
        'verify',
      ]); 
      if(!await decrypt(dkCK, ivArr, hmkCK)){
        setCookie(GenerateCookieName(), keyData, -1);
      }
    }
    EventTarget.addEventListener('keydown', (event) => {
      if(event.isComposing||event.keyCode === 13){
        const password = document.getElementById('hbePass').value;
        const keyMaterial = await getKeyMaterial(password);
        const hmacKey = await getHmacKey(keyMaterial);
        const decryptKey = await getDecryptKey(keyMaterial);
        const iv = await getIv(keyMaterial);
        const result = await decrypt(password);
        if(result){
          const cookieStorage = {
            'dk': await cryptoObj.subtle.exportKey('jwk', decryptKey),
            'iv': iv.toString('hex'),
            'hmk': await cryptoObj.subtle.exportKey('jwk', hmacKey),
          };
          setCookie(GenerateCookieName(), cookieStorage, 30);
        }
      }
    });

  }

  hbeLoader();

})();