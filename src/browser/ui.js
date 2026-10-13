'use strict';

// Wires the encrypted-post UI: form submit (Enter + click both fire),
// `aria-busy` during async derivation, and an inline `[role="alert"]` for
// errors (NO `alert()` calls). Every lookup is scoped to one post's wrapper,
// so several encrypted posts can share a page even when their themes repeat
// the same element ids.

function findForm(el) {
  return el.querySelector('#hbeForm,.hbe-form,form');
}

function findInput(el) {
  return el.querySelector('#hbePass,.hbe-input-field,input[type="password"]');
}

// Keep the <label for> / <input id> pair unique per wrapper. The first post
// keeps `hbePass` (themes and user CSS may target it); later duplicates are
// renamed and their own label is re-pointed.
let idCounter = 0;
function ensureUniqueId(el, input) {
  if (!input) return;
  const oldId = input.id;
  if (oldId && document.getElementById(oldId) === input) return;
  let newId;
  do {
    newId = (oldId || 'hbePass') + '-' + (++idCounter);
  } while (document.getElementById(newId));
  const labels = el.querySelectorAll('label');
  for (let i = 0; i < labels.length; i++) {
    if (oldId && labels[i].htmlFor === oldId) labels[i].htmlFor = newId;
  }
  input.id = newId;
}

function setBusy(form, input, busy) {
  if (form) {
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    const button = form.querySelector('.hbe-button');
    if (button) button.disabled = !!busy;
  }
  if (input) input.disabled = !!busy;
}

function showError(el, message) {
  let alert = el.querySelector('[role="alert"]');
  if (!alert) {
    alert = document.createElement('div');
    alert.setAttribute('role', 'alert');
    alert.className = 'hbe hbe-error';
    const form = findForm(el);
    if (form) form.parentNode.insertBefore(alert, form.nextSibling);
    else el.appendChild(alert);
  }
  alert.textContent = message;
}

function clearError(el) {
  const alert = el.querySelector('[role="alert"]');
  if (alert) alert.textContent = '';
}

function attachSubmit(form, handler) {
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handler();
  });
}

module.exports = {
  findForm,
  findInput,
  ensureUniqueId,
  setBusy,
  showError,
  clearError,
  attachSubmit,
};
