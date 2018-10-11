'use strict';

function decryptAES () {

  const pass = String(document.getElementById('pass').value);
  try {

    var decryptionError = String(document.getElementById('decryptionError').innerHTML);
    var noContentError = String(document.getElementById('noContentError').innerHTML);

  } catch (e) {

    decryptionError = 'Incorrect Password!';
    noContentError = 'No content to display!';

  }

  try {

    let content = CryptoJS.AES.decrypt(document.getElementById('encrypt-blog').innerHTML.trim(), pass);
    content = content.toString(CryptoJS.enc.Utf8);
    content = decodeBase64(content);
    content = unescape(content);
    if (content === '') {

      throw new Error(noContentError); // ???

    } else {

      document.getElementById('encrypt-blog').style.display = 'inline';
      document.getElementById('encrypt-blog').innerHTML = '';

      // Use jquery to load some js code
      try {

        $('#encrypt-blog').html(content);

      } catch(e) {

        const errorInfo = '<p>'
                      + 'Some errors occurred, check the original file please.'
                      + 'Detailed exception are shown in console.'
                      + '</p>';
        console.error(e);
        $('#encrypt-blog').html(errorInfo);

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

  }

}

function htmlDecode (str) {

  let s = '';
  if (str.length == 0) {

    return '';

  }

  s = str.replace(/&gt;/g, '&');
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  s = s.replace(/&nbsp;/g, '    '); // ??? why not ' '
  s = s.replace(/'/g, '\'');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/<br>/g, '\n');
  return s;

}

function decodeBase64 (content) {

  content = CryptoJS.enc.Base64.parse(content);
  content = CryptoJS.enc.Utf8.stringify(content);
  return content;

}

// Since you decided to use jQuery.
$(document).ready(
  function () {

    console.log('Registering Enter for decrypt.');
    document.getElementById('pass').onkeypress = function (keyPressEvent) {

      if (keyPressEvent.keyCode === 13) {

        decryptAES();

      }

    };

  }
);
