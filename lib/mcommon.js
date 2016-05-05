function decryptAES() {
    var pass = document.getElementById("pass").value;
    try {
        var bytes = CryptoJS.AES.decrypt(document.getElementById("encrypt-blog").innerHTML, pass);
        var content = bytes.toString(CryptoJS.enc.Utf8);
        console.log(content);
        content = unescape(content);
        if (content == '') {
            alert("密码错误！！");
        }
        document.getElementById("encrypt-blog").style.display="inline";
        document.getElementById("encrypt-blog").innerHTML = content;
        document.getElementById("security").style.display="none";
    } catch (e) {
        alert("密码错误！！");
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
