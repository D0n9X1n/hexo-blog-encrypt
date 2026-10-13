/* hbe-toc.js: theme-agnostic table of contents for hexo-blog-encrypt posts.
 *
 * Builds the TOC in the browser from the decrypted post, so the published
 * HTML never contains the encrypted post's headings. Markup matches Hexo's
 * `toc()` helper (`ol.<cls> > li.<cls>-item.<cls>-level-N > a.<cls>-link >
 * span.<cls>-text`, nested `ol.<cls>-child`), so most theme CSS and scrollspy
 * code works unchanged.
 *
 * Configure before this script loads (all optional):
 *   window.HBE_TOC = {
 *     container: '#toc',          // element that receives the TOC
 *     className: 'toc',           // Hexo toc() `class` option ('nav' for NexT, Keep, Redefine)
 *     maxDepth: 6,                // deepest heading level to include
 *     listNumber: false,          // add <span class="<cls>-number"> like toc({list_number: true})
 *     onRender: function (container, decrypted) {}, // re-run the theme's scrollspy here
 *   };
 */
(function () {
  'use strict';

  var opts = window.HBE_TOC || {};
  var cls = opts.className || 'toc';
  var maxDepth = opts.maxDepth || 6;

  function slug(text, used) {
    var base = text.trim().toLowerCase().replace(/[\s]+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'section';
    var id = base;
    for (var i = 1; used[id] || document.getElementById(id); i++) id = base + '-' + i;
    used[id] = true;
    return id;
  }

  function headings(root) {
    var selector = [];
    for (var level = 1; level <= maxDepth; level++) selector.push('h' + level);
    return Array.prototype.filter.call(root.querySelectorAll(selector.join(',')), function (h) {
      return h.textContent.trim() !== '';
    });
  }

  function build(root) {
    var used = {};
    var list = document.createElement('ol');
    list.className = cls;
    // stack[i] = { level, item } for the open ancestors of the next heading.
    var stack = [];
    var counters = [];

    headings(root).forEach(function (h) {
      var level = Number(h.tagName.charAt(1));
      if (!h.id) h.id = slug(h.textContent, used);

      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      counters.length = stack.length + 1;
      counters[stack.length] = (counters[stack.length] || 0) + 1;

      var parentList = list;
      if (stack.length) {
        var parent = stack[stack.length - 1].item;
        parentList = parent.querySelector(':scope > ol.' + cls + '-child');
        if (!parentList) {
          parentList = document.createElement('ol');
          parentList.className = cls + '-child';
          parent.appendChild(parentList);
        }
      }

      var item = document.createElement('li');
      item.className = cls + '-item ' + cls + '-level-' + level;
      var link = document.createElement('a');
      link.className = cls + '-link';
      link.setAttribute('href', '#' + encodeURIComponent(h.id));
      if (opts.listNumber) {
        var number = document.createElement('span');
        number.className = cls + '-number';
        number.textContent = counters.join('.') + '.';
        link.appendChild(number);
        link.appendChild(document.createTextNode(' '));
      }
      var text = document.createElement('span');
      text.className = cls + '-text';
      // textContent, never innerHTML: headings are author content, not markup we trust.
      text.textContent = h.textContent.trim();
      link.appendChild(text);
      item.appendChild(link);
      parentList.appendChild(item);
      stack.push({ level: level, item: item });
    });
    return list;
  }

  function render() {
    var decrypted = document.querySelector('#hexo-blog-encrypt.hbe-decrypted-content');
    var container = document.querySelector(opts.container || '#toc');
    if (!decrypted || !container) return;
    var list = build(decrypted);
    container.textContent = '';
    if (list.children.length) container.appendChild(list);
    container.hidden = false;
    container.style.removeProperty('display');
    if (typeof opts.onRender === 'function') opts.onRender(container, decrypted);
  }

  // Some forks dispatch a plain Event without `detail`, so never read it.
  window.addEventListener('hexo-blog-decrypt', render);
  // With autoSave, a cached key can decrypt before this script runs.
  render();
})();
