'use strict';

// DOM helpers preserved from v3 (`getExecutableScript` + `convertHTMLToElement`):
// when ciphertext decrypts to HTML containing `<script>` tags, the browser does
// NOT execute scripts inserted via `innerHTML`. We re-create them as live <script>
// elements so the decrypted post behaves like a normal Hexo-rendered post.

function getExecutableScript(oldScriptElement) {
  const newScript = document.createElement('script');
  for (const attr of oldScriptElement.attributes) {
    newScript.setAttribute(attr.name, attr.value);
  }
  newScript.text = oldScriptElement.text;
  return newScript;
}

function convertHTMLToElement(htmlString) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = htmlString;
  // Replace each <script> with a live, executable element.
  for (const oldScript of wrapper.querySelectorAll('script')) {
    oldScript.parentNode.replaceChild(getExecutableScript(oldScript), oldScript);
  }
  return wrapper;
}

// Replace the encrypted wrapper with the decrypted DOM. Returns the new container
// so callers can inspect / dispatch events on it.
function swapInDecryptedDOM(mainElement, plaintextHTML) {
  const decrypted = convertHTMLToElement(plaintextHTML);
  decrypted.id = 'hexo-blog-encrypt';
  decrypted.classList.add('hbe', 'hbe-decrypted-content');
  mainElement.parentNode.replaceChild(decrypted, mainElement);
  return decrypted;
}

module.exports = {
  getExecutableScript,
  convertHTMLToElement,
  swapInDecryptedDOM,
};
