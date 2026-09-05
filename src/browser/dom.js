'use strict';

// innerHTML leaves scripts inert. Attach the complete decrypted DOM first, then
// restore executable scripts so initializers can find both content and libraries.
const SCRIPT_LOAD_TIMEOUT = 15000;
const JAVASCRIPT_TYPE = /^(?:application|text)\/(?:x-)?(?:java|ecma)script$|^text\/(?:javascript1\.[0-5]|jscript|livescript)$/i;

function getExecutableScript(oldScriptElement) {
  const newScript = document.createElement('script');
  for (const attr of oldScriptElement.attributes) {
    newScript.setAttribute(attr.name, attr.value);
  }
  // CSP hides the nonce attribute after attachment; the property retains it.
  if (oldScriptElement.nonce) newScript.nonce = oldScriptElement.nonce;
  newScript.text = oldScriptElement.text;
  return newScript;
}

function convertHTMLToElement(htmlString) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = htmlString;
  return wrapper;
}

function scriptType(script) {
  let type = script.getAttribute('type');
  if (type === null) {
    const language = script.getAttribute('language');
    type = language ? 'text/' + language : '';
  }
  const keyword = type.toLowerCase();
  if (keyword === 'module') return 'module';
  if (keyword === 'importmap' || keyword === 'speculationrules') return 'declarative';
  const mime = type.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
  if (type === '' || JAVASCRIPT_TYPE.test(mime)) return 'classic';
  return 'data';
}

function restoreScript(oldScript, newScript, waitForLoad) {
  if (!waitForLoad) {
    oldScript.parentNode.replaceChild(newScript, oldScript);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      newScript.removeEventListener('load', finish);
      newScript.removeEventListener('error', finish);
      resolve();
    };
    // A broken third-party dependency must not prevent the decrypt callback
    // forever. A timed-out script can still execute later; this is not a cancel.
    const timer = setTimeout(() => {
      console.warn('hexo-blog-encrypt: timed out waiting for a decrypted script to load.');
      finish();
    }, SCRIPT_LOAD_TIMEOUT);
    // Do not overwrite onload/onerror attributes copied from the original tag.
    newScript.addEventListener('load', finish);
    newScript.addEventListener('error', finish);
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });
}

async function restoreScripts(container) {
  const pending = [];
  const supportsModules = 'noModule' in document.createElement('script');
  for (const oldScript of container.querySelectorAll('script')) {
    // Earlier user scripts may remove later nodes. Do not execute detached ones.
    if (!container.contains(oldScript)) continue;
    const type = scriptType(oldScript);
    if (type === 'data' || (type === 'classic' && oldScript.noModule && supportsModules)) continue;
    if (type === 'module' && !supportsModules) continue;

    const newScript = getExecutableScript(oldScript);
    // Inline modules have no native load event. Keep their native async
    // semantics instead of adding a false timeout or rewriting their source.
    const waitForLoad = type !== 'declarative' && newScript.hasAttribute('src');
    const independent = waitForLoad && newScript.hasAttribute('async');
    // Dynamically created classics default to async even without the attribute.
    if (type === 'classic' && waitForLoad && !independent) newScript.async = false;
    const loaded = restoreScript(oldScript, newScript, waitForLoad);
    if (independent) pending.push(loaded);
    else await loaded;
  }
  await Promise.all(pending);
}

// Resolve after restored scripts load, fail, or time out. Native module load
// events do not await arbitrary async work such as top-level await continuations.
async function swapInDecryptedDOM(mainElement, plaintextHTML) {
  const decrypted = convertHTMLToElement(plaintextHTML);
  decrypted.id = 'hexo-blog-encrypt';
  decrypted.classList.add('hbe', 'hbe-decrypted-content');
  mainElement.parentNode.replaceChild(decrypted, mainElement);
  await restoreScripts(decrypted);
  return decrypted;
}

module.exports = {
  getExecutableScript,
  convertHTMLToElement,
  swapInDecryptedDOM,
};
