/* Independent of the game bundle so failed imports still have a way back. */
(function () {
  'use strict';
  var root = document.getElementById('bw-loading');
  if (!root) return;
  var game = document.getElementById('game');
  var get = function (name) { return document.getElementById('bw-loading-' + name); };
  var copy = get('copy'), status = get('status');
  var retry = get('retry'), details = get('details'), diagnostic = get('diagnostic');
  var firstError = '', done = false, slow = false;
  var slowTimer, retryTimer;

  function remember(error) {
    if (!error || firstError) return;
    firstError = String(error.stack || error.message || error).slice(0, 12000);
    diagnostic.textContent = firstError;
    if (slow || !retry.hidden) details.hidden = false;
  }

  function clearTimers() {
    clearTimeout(slowTimer);
    clearTimeout(retryTimer);
  }

  function loadingIssue(error) {
    if (done) return;
    remember(error);
    // A request can report an error while startup still reaches readiness.
    // Keep the indicator running until the mounted game reports ready.
    retry.hidden = false;
    details.hidden = !firstError;
  }

  function ready() {
    if (done) return;
    done = true;
    clearTimers();
    window.removeEventListener('brackenwake:boot', update);
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
    // Allow the newly mounted roster, creation screen or first game frame to paint.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.dataset.state = 'ready';
        game?.setAttribute('aria-busy', 'false');
        status.textContent = 'Ready';
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(function () {
          var heldFocus = root.contains(document.activeElement);
          ['game', 'hud'].forEach(function (id) {
            var surface = document.getElementById(id);
            if (surface) surface.inert = false;
          });
          root.remove();
          if (heldFocus) document.getElementById('game')?.focus({ preventScroll: true });
        }, reduced ? 0 : 240);
      });
    });
  }

  function update(event) {
    var detail = event.detail || {};
    if (detail.phase === 'ready') ready();
    else if (detail.phase === 'failed') loadingIssue(detail.error);
    else if (detail.phase === 'world' && !done && !slow) status.textContent = 'Preparing the world';
  }

  function onError(event) {
    var target = event.target;
    if (target?.tagName === 'SCRIPT' && target.type === 'module') {
      loadingIssue('The game module could not be loaded.\n' + (target.src || ''));
    } else remember(event.error || event.message);
  }
  function onRejection(event) { remember(event.reason); }

  retry.addEventListener('click', function () { window.location.reload(); });
  window.addEventListener('brackenwake:boot', update);
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  slowTimer = setTimeout(function () {
    if (done) return;
    slow = true;
    copy.textContent = 'Taking a little longer. Waiting for the world to be ready.';
    status.textContent = 'Still loading';
    details.hidden = !firstError;
  }, 8000);
  retryTimer = setTimeout(function () {
    if (done) return;
    copy.textContent = 'This is taking longer than expected. You can keep waiting or try again.';
    retry.hidden = false;
    // Time alone is not a failure. A slow connection can still finish normally.
  }, 45000);
}());
