/* Independent of the game bundle so failed imports still have a way back. */
(function () {
  'use strict';
  var root = document.getElementById('bw-loading');
  if (!root) return;
  var game = document.getElementById('game');
  var get = function (name) { return document.getElementById('bw-loading-' + name); };
  var heading = get('heading'), copy = get('copy'), status = get('status');
  var retry = get('retry'), details = get('details'), diagnostic = get('diagnostic');
  var firstError = '', done = false, failed = false, slow = false;
  var slowTimer, retryTimer;

  function remember(error) {
    if (!error || firstError) return;
    firstError = String(error.stack || error.message || error).slice(0, 12000);
    diagnostic.textContent = firstError;
    if (slow || failed) details.hidden = false;
  }

  function clearTimers() {
    clearTimeout(slowTimer);
    clearTimeout(retryTimer);
  }

  function fail(error) {
    if (done) return;
    remember(error);
    failed = true;
    clearTimers();
    root.dataset.state = 'failed';
    game?.setAttribute('aria-busy', 'false');
    heading.textContent = 'We couldn’t open Brackenwake';
    copy.textContent = 'The world didn’t finish loading. Try again when you’re ready.';
    status.textContent = 'Loading interrupted';
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
    else if (detail.phase === 'failed') fail(detail.error);
    else if (detail.phase === 'world' && !done && !failed && !slow) status.textContent = 'Preparing the world';
  }

  function onError(event) {
    var target = event.target;
    if (target?.tagName === 'SCRIPT' && target.type === 'module') {
      fail('The game module could not be loaded.\n' + (target.src || ''));
    } else remember(event.error || event.message);
  }
  function onRejection(event) { remember(event.reason); }

  retry.addEventListener('click', function () { window.location.reload(); });
  window.addEventListener('brackenwake:boot', update);
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  slowTimer = setTimeout(function () {
    if (done || failed) return;
    slow = true;
    copy.textContent = 'Taking a little longer. We’re still getting the world ready.';
    status.textContent = 'Still loading';
    details.hidden = !firstError;
  }, 8000);
  retryTimer = setTimeout(function () {
    if (done || failed) return;
    copy.textContent = 'This is taking longer than expected. You can keep waiting or try again.';
    retry.hidden = false;
    // Time alone is not a failure. A slow connection can still finish normally.
  }, 45000);
}());
