'use strict';

// A small, local dependency makes the loading race reproducible without a CDN.
(function () {
  const library = document.getElementById('hbe-demo-library');
  library.textContent = 'External library: loaded';
  library.dataset.complete = 'true';

  window.HbeScriptOrderDemo = {
    mount(root) {
      const initialized = root.querySelector('#hbe-demo-init');
      initialized.textContent = 'Inline initializer: widget connected';
      initialized.dataset.complete = 'true';
      root.querySelector('#hbe-demo-status').textContent = 'Library loaded. Waiting for the callback.';
      root.querySelector('#hbe-demo-try').addEventListener('click', () => {
        root.querySelector('#hbe-demo-output').textContent =
          'The widget works: its library loaded before initialization.';
      });
      root.querySelector('#hbe-demo-reset').addEventListener('click', () => {
        try {
          localStorage.removeItem('hbe.v4.' + location.pathname + location.search);
        } catch (_error) {
          root.querySelector('#hbe-demo-status').textContent =
            'Browser storage is unavailable. Open a private window to try again.';
          return;
        }
        location.reload();
      });
    },
  };
})();
