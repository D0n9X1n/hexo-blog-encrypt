<<<<<<< HEAD
(() => {
  'use strict';

  const cryptoObj = window.crypto || window.msCrypto;
  const storage = window.localStorage;

  const storageName = 'hexo-blog-encrypt';
  const keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
  const ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');

  const mainElement = document.getElementById('hexo-blog-encrypt');
  const wrongPassMessage = mainElement.dataset['wpm'];
  const wrongHashMessage = mainElement.dataset['whm'];
  const dataElement = mainElement.getElementsByTagName('script')['hbeData'];
  const encryptedData = dataElement.innerText;
  const HmacDigist = dataElement.dataset['hmacdigest'];

  function hexToArray(s) {
    return new Uint8Array(s.match(/[\da-f]{2}/gi).map((h => {
      return parseInt(h, 16);
    })));
  }

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

  function arrayBufferToHex(arrayBuffer) {
    if (typeof arrayBuffer !== 'object' || arrayBuffer === null || typeof arrayBuffer.byteLength !== 'number') {
      throw new TypeError('Expected input to be an ArrayBuffer')
    }

    var view = new Uint8Array(arrayBuffer)
    var result = ''
    var value

    for (var i = 0; i < view.length; i++) {
      value = view[i].toString(16)
      result += (value.length === 1 ? '0' + value : value)
    }

    return result
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

=======
/* global CryptoJS, MathJax */
'use strict';

const hbeCookieName = 'HBEPASSWORD';

function getExecutableScript(oldElem){
  let out = document.createElement('script');
  const attList = ['type', 'text', 'src', 'crossorigin', 'defer', 'referrerpolicy'];
  attList.forEach((att) => {
    if(oldElem[att])
      out[att] = oldElem[att];
  })

  return out;
}

function convertHTMLToElement(content){
  let out = document.createElement('div');
  out.innerHTML = content;
  out.querySelectorAll('script').forEach((elem) => {
    elem.parentNode.replaceChild(getExecutableScript(elem), elem);
  });

  return out;
}


function decryptAES (password) {
  try {
    var decryptionError = String(document.getElementById('decryptionError').innerHTML);
    var noContentError = String(document.getElementById('noContentError').innerHTML);
  } catch (e) {
    decryptionError = 'Incorrect Password!';
    noContentError = 'No content to display!';
  }

  try {
    let content = unescape(CryptoJS.AES.decrypt(document.getElementById('encrypt-blog').innerHTML.trim(), password).toString(CryptoJS.enc.Utf8));

    if (content === '') {
      throw new Error(noContentError);
    } else {
      document.getElementById('encrypt-blog').style.display = 'inline';
      document.getElementById('encrypt-blog').innerHTML = '';

      try{
        document.getElementById('encrypt-blog').appendChild(convertHTMLToElement(content));
        callBackReplaceHere // eslint-disable-line no-undef
      } catch (e){
        const errorInfo = '<p>'
          + 'Some errors occurred, check the original file please.'
          + 'Detailed exceptions are shown in console.'
          + '</p>';
        console.error(e);
        document.getElementById('encrypt-blog').innerHTML = errorInfo;
      }

      document.getElementById('hbe-security').style.display = 'none';
      if (document.getElementById('toc-div')) {
        document.getElementById('toc-div').style.display = 'inline';
      }
    }

    // Call MathJax to render
    if(typeof MathJax !== 'undefined') {
      try {
        MathJax.Hub.Queue(
          ['resetEquationNumbers', MathJax.InputJax.TeX, ],
          ['PreProcess', MathJax.Hub, ],
          ['Reprocess', MathJax.Hub, ]
        );
      } catch (e) {
        console.log('Can\'t render with MathJax');
      }
    }
  } catch (e) {
    alert(decryptionError);
    console.log(e);
    return false;
  }

  return true;

}

function setCookie (cookieName, cookieValue, expireMinutes) {
  const expireTime = new Date(new Date().getTime() + 1000 * 60 * expireMinutes);
  document.cookie = `${ cookieName }=${ escape(cookieValue) }${ expireMinutes == null ? '' : `;expires=${ expireTime.toGMTString() }` }`;
}

function getCookie (cookieName) {
  if (document.cookie.length > 0) {
    let idx = document.cookie.indexOf(`${ cookieName }=`);
    if (idx != -1) {
      idx = idx + cookieName.length + 1;
      let idy = document.cookie.indexOf(';', idx);
      if (idy == -1) {
        idy = document.cookie.length;
      }

      return unescape(document.cookie.substring(idx, idy));
    }
  }

  return '';
}

function getUrlRelativePath () {
  const url = document.location.toString();
  const arrUrl = url.split('//');

  const start = arrUrl[1].indexOf('/');
  let relUrl = arrUrl[1].substring(start);

  if(relUrl.indexOf('?') != -1) {
    relUrl = relUrl.split('?')[0];
  }

  return relUrl;
}

function generateCookieName () {
  return hbeCookieName + getUrlRelativePath();
}

function hbeLoader(){
  let password = String(getCookie(generateCookieName()));
  console.log(`Get password from Cookie:${password}`);
>>>>>>> master

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
      'iterations': 1024,
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
      'iterations': 512,
    }, keyMaterial, 512 * 8);
  }

  async function verifyContent(key, content) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(content);

    let signature = hexToArray(HmacDigist);
    const result = await cryptoObj.subtle.verify({
      'name': 'HMAC',
      'hash': 'SHA-256',
    }, key, signature, encoded);
    console.log(`Verification result: ${result}`);
    if(!result){
      alert(wrongHashMessage);
      console.log(`${wrongHashMessage}, got `, signature, ` but proved wrong.`);
    }
    return result;
  }

  async function decrypt(decryptKey, iv, hmacKey) {

    let typedArray = hexToArray(encryptedData);

    const result = await cryptoObj.subtle.decrypt({
      'name': 'AES-CBC',
      'iv': iv,
    }, decryptKey, typedArray.buffer).then(async (result) => {
      const decoder = new TextDecoder();
      const decoded = decoder.decode(result);

      const hideButton = document.createElement('button');
      hideButton.textContent = 'Hide again';
      hideButton.type = 'button';
      hideButton.addEventListener('click', () => {
        window.localStorage.removeItem('hexo-blog-encrypt');
        alert('Password has been removed.');
        window.location.reload();
      });

      document.getElementById('hexo-blog-encrypt').style.display = 'inline';
      document.getElementById('hexo-blog-encrypt').innerHTML = '';
      document.getElementById('hexo-blog-encrypt').appendChild(hideButton);
      document.getElementById('hexo-blog-encrypt').appendChild(await convertHTMLToElement(decoded));
      return await verifyContent(hmacKey, decoded);
    }).catch((e) => {
      alert(wrongPassMessage);
      console.log(e);
      return false;
    });

    return result;

<<<<<<< HEAD
  }

  function hbeLoader() {

    const oldStorageData = JSON.parse(storage.getItem(storageName));

    if (oldStorageData) {
      console.log(`Password got from localStorage(${storageName}): `, oldStorageData);
      const sIv = hexToArray(oldStorageData.iv).buffer;
      const sDk = oldStorageData.dk;
      const sHmk = oldStorageData.hmk;

      cryptoObj.subtle.importKey('jwk', sDk, {
        'name': 'AES-CBC',
        'length': 256,
      }, true, [
        'decrypt',
      ]).then((dkCK) => {
        cryptoObj.subtle.importKey('jwk', sHmk, {
          'name': 'HMAC',
          'hash': 'SHA-256',
          'length': 256,
        }, true, [
          'verify',
        ]).then((hmkCK) => {
          decrypt(dkCK, sIv, hmkCK).then((result) => {
            if (!result) {
              storage.removeItem(storageName);
            }
          });
        });
      });
    }

    mainElement.addEventListener('keydown', async (event) => {
      if (event.isComposing || event.keyCode === 13) {
        const password = document.getElementById('hbePass').value;
        const keyMaterial = await getKeyMaterial(password);
        const hmacKey = await getHmacKey(keyMaterial);
        const decryptKey = await getDecryptKey(keyMaterial);
        const iv = await getIv(keyMaterial);
        decrypt(decryptKey, iv, hmacKey).then((result) => {

          console.log(`Decrypt result: ${result}`);
          if (result) {
            cryptoObj.subtle.exportKey('jwk', decryptKey).then((dk) => {
              cryptoObj.subtle.exportKey('jwk', hmacKey).then((hmk) => {
                const newStorageData = {
                  'dk': dk,
                  'iv': arrayBufferToHex(iv),
                  'hmk': hmk,
                };
                storage.setItem(storageName, JSON.stringify(newStorageData));
              });
            });
          }

        });
      }
    });

  }
=======
    password = String(document.getElementById('pass').value);
    if (keyPressEvent.keyCode === 13) {
      const result = decryptAES(password);
      if (result) {
        setCookie(GenerateCookieName(), password, 30);
      }
    }
  };
}
>>>>>>> master

  hbeLoader();

})();
