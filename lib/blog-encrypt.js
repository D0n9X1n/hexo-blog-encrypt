(() => {
  'use strict';

  const cryptoObj = window.crypto || window.msCrypto;
  const storage = window.localStorage;

  const storageName = 'HBEPASSWORD';
  const keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
  const ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');

  const mainElement = document.getElementById('hexo-blog-encrypt');
  const wrongPassMessage = mainElement.dataset['wpm'];
  const wrongHashMessage = mainElement.dataset['whm'];
  const dataElement = mainElement.getElementsByTagName('script')['hbeData'];
  const encryptedData = dataElement.innerText;
  const HmacDigist = dataElement.dataset['hmacdigest'];


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
    out.querySelectorAll('script').forEach(async (elem) => {
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
      'salt': keySalt.buffer,
      'iterations': 256,
    }, keyMaterial, {
      'name': 'HMAC',
      'hash': 'SHA-256',
      'length': 256,
    }, true, [
      'verify',
    ]);
  }

  function getDecryptKey(keyMaterial) {
    return cryptoObj.subtle.deriveKey({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': keySalt.buffer,
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
      'salt': ivSalt.buffer,
      'iterations': 128,
    }, keyMaterial, 16*8);
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
    }, key, signature, encoded);
    if(!result){
      alert(wrongHashMessage);
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
    }, decryptKey, typedArray.buffer).then(async (result) => {
      const decoder = new TextDecoder();
      const decoded = decoder.decode(result);
      document.getElementById('hexo-blog-encrypt').style.display = 'inline';
      document.getElementById('hexo-blog-encrypt').innerHTML = '';
      document.getElementById('hexo-blog-encrypt').appendChild(await convertHTMLToElement(decoded));
      return await verifyContent(hmacKey, decoded);
    }).catch((e) => {
      alert(wrongPassMessage);
      console.log(e);
      return false;
    });

  }

  function hbeLoader() {

    const oldStorageData = storage.getItem(storageName);

    if (oldStorageData){
      console.log(`Password got from localStorage:${oldStorageData}.`);
      const sIv = oldStorageData.iv;
      const sDk = oldStorageData.dk;
      const sHmk = oldStorageData.hmk;
      const ivArr = new Uint8Array(sIv.match(/[\da-f]{2}/gi).map((h => {
        return parseInt(h, 16);
      })));
      let dkCK = cryptoObj.subtle.importKey('jwk', sDk, {
        'name': 'PBKDF2',
        'hash': 'SHA-256',
        'salt': keySalt.buffer,
        'iterations': 256,
      }, true, [
        'verify',
      ]);
      let hmkCK = cryptoObj.subtle.importKey('jwk', sHmk, {
        'name': 'PBKDF2',
        'hash': 'SHA-256',
        'salt': keySalt.buffer,
        'iterations': 256,
      }, true, [
        'verify',
      ]);
      decrypt(dkCK, ivArr, hmkCK).then((result) => {
        if(!result){
          setCookie(GenerateCookieName(), keyData, -1);
        }
      });
    }
    mainElement.addEventListener('keydown', async (event) => {
      if(event.isComposing||event.keyCode === 13){
        const password = document.getElementById('hbePass').value;
        const keyMaterial = await getKeyMaterial(password);
        const hmacKey = await getHmacKey(keyMaterial);
        const decryptKey = await getDecryptKey(keyMaterial);
        const iv = await getIv(keyMaterial);
        const result = await decrypt(decryptKey, iv, hmacKey);
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
