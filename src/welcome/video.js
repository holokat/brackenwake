// Keep the original artwork visible until the first decoded video frame plays.
// Reduced motion avoids downloading the video altogether on the initial visit.
export function mountBackgroundVideo(video, signal) {
  if (!video || signal.aborted) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  let revision = 0;
  const canPlay = () => !disposed && !preference.matches && !document.hidden;
  const hide = () => video.classList.remove('is-playing');

  video.muted = true;
  video.loop = true;
  video.playsInline = true;

  async function sync() {
    const current = ++revision;
    if (!canPlay()) {
      video.pause();
      if (preference.matches) hide();
      return;
    }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    try {
      await video.play();
      if (!canPlay()) video.pause();
    } catch {
      // Autoplay denial, decoding errors and interrupted play retain the art.
      if (current === revision) hide();
    }
  }

  video.addEventListener('playing', () => {
    if (canPlay()) video.classList.add('is-playing');
    else video.pause();
  }, { signal });
  video.addEventListener('error', hide, { signal });
  preference.addEventListener('change', sync, { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  signal.addEventListener('abort', () => {
    disposed = true;
    revision++;
    video.pause();
    hide();
    video.removeAttribute('src');
    video.load();
  }, { once: true });
  void sync();
}
