'use strict';

// Wires the encrypted-post UI: form submit (Enter + click both fire),
// `aria-busy` during async derivation, and an inline `[role="alert"]` for
// errors (NO `alert()` calls — feature-crew critique blocked dialog UX).

function setBusy(form, busy) {
  if (!form) return;
  form.setAttribute('aria-busy', busy ? 'true' : 'false');
  const button = form.querySelector('.hbe-button');
  if (button) {
    button.disabled = !!busy;
  }
  const input = form.querySelector('#hbePass');
  if (input) {
    input.disabled = !!busy;
  }
}

function showError(mainElement, message) {
  let alert = mainElement.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('div');
    alert.setAttribute('role', 'alert');
    alert.className = 'hbe hbe-error';
    const form = mainElement.querySelector('#hbeForm');
    if (form) form.parentNode.insertBefore(alert, form.nextSibling);
    else mainElement.appendChild(alert);
  }
  alert.textContent = message;
}

function clearError(mainElement) {
  const alert = mainElement.querySelector('[role="alert"]');
  if (alert) alert.textContent = '';
}

function readPassword(form) {
  const input = form.querySelector('#hbePass');
  return input ? input.value : '';
}

function attachSubmit(form, handler) {
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handler();
  });
}

module.exports = {
  setBusy,
  showError,
  clearError,
  readPassword,
  attachSubmit,
};
