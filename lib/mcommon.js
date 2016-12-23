function decryptAES() {
    var pass = String(document.getElementById("pass").value);
    try {
        var content = CryptoJS.AES.decrypt(document.getElementById("encrypt-blog").innerHTML.trim(), pass);
        content = content.toString(CryptoJS.enc.Utf8);
        content = decodeBase64(content);
        console.log(content);
        content = unescape(content);
        if (content == '') {
            alert("密码错误！！");
        } else {
            document.getElementById("encrypt-blog").style.display    = "inline";
            document.getElementById("encrypt-blog").innerHTML        = content;
            document.getElementById("encrypt-message").style.display = "none";

            document.getElementById("security").style.display        = "none";

            if (document.getElementById("toc-div")) {
                document.getElementById("toc-div").style.display     = "inline";
            }
        }
    } catch (e) {
        alert("密码错误！！");
        console.log(e);
    }
}

function htmlDecode (str) {
    var s = "";
    if (str.length == 0) return "";

    s = str.replace(/&gt;/g, "&");
    s = s.replace(/&lt;/g,   "<");
    s = s.replace(/&gt;/g,   ">");
    s = s.replace(/&nbsp;/g, "    ");
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


// add enter to decrypt
addLoadEvent(function() {
    console.log('register');
    document.getElementById("pass").onkeypress = function(keyPressEvent) {
        console.log(keyPressEvent.keyCode === 13);
        if (keyPressEvent.keyCode === 13) {
            decryptAES();
        }
    };
});

function addLoadEvent(func) {
    var oldonload = window.onload;
    if (typeof window.onload != 'function') {
        window.onload = func;
    } else {
        window.onload = function() {
            oldonload();
            func();
        }
    }
}
