'use strict';

function decryptAES() {
  var pass = String(document.getElementById("pass").value);
  try {
    var content = CryptoJS.AES.decrypt(document.getElementById("encrypt-blog").innerHTML.trim(), pass);
    content = content.toString(CryptoJS.enc.Utf8);
    content = decodeBase64(content);
    content = unescape(content);
    if (content === "") {
      throw new Error("内容为空"); // ???
    } else {
      document.getElementById("encrypt-blog").style.display = "inline";
      document.getElementById("encrypt-blog").innerHTML = "";
      // use jquery to load some js code
      $("#encrypt-blog").html(content);
        document.getElementById("security").style.display  = "none";
        if (document.getElementById("toc-div")) {
          document.getElementById("toc-div").style.display = "inline";
        }
      }
      // Call MathJax to render
      if(typeof MathJax !== "undefined") {
        MathJax.Hub.Queue(
          ['resetEquationNumbers', MathJax.InputJax.TeX],
          ['PreProcess', MathJax.Hub],
          ['Reprocess', MathJax.Hub]
        );
      }
    } catch (e) {
      alert("解密失败");
      console.log(e);
    }
}

function htmlDecode (str) {
  var s = "";
  if (str.length == 0) return "";

  s = str.replace(/&gt;/g, "&");
  s = s.replace(/&lt;/g,   "<");
  s = s.replace(/&gt;/g,   ">");
  s = s.replace(/&nbsp;/g, "    "); // ??? why not ' '
  s = s.replace(/'/g,      "\'");
  s = s.replace(/&quot;/g, "\"");
  s = s.replace(/<br>/g,   "\n");
  return s;
}

function decodeBase64(content) {
  content = CryptoJS.enc.Base64.parse(content);
  content = CryptoJS.enc.Utf8.stringify(content);
  return content;
}

// Since you decided to use jQuery.
$(document).ready(
  function(){
    console.log("Registering Enter for decrypt.");
    document.getElementById("pass").onkeypress = function(keyPressEvent) {
     if (keyPressEvent.keyCode === 13) {
       decryptAES();
     }
    }
  }
);
