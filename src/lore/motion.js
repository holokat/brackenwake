/** Optional atmosphere. Content is never hidden or dependent on this module. */
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const cover = document.querySelector('.page-cover');
const image = cover?.querySelector('img');
let frame = 0;

function paintDepth() {
  frame = 0;
  if (motion.matches || !image) return;
  const bounds = cover.getBoundingClientRect();
  if (bounds.bottom < 0) return;
  const travel = Math.min(Math.max(-bounds.top, 0), bounds.height) * .12;
  image.style.transform = `translateY(${travel}px) scale(1.06)`;
}

function requestDepth() {
  if (!frame && !motion.matches) frame = requestAnimationFrame(paintDepth);
}

addEventListener('scroll', requestDepth, { passive: true });
addEventListener('resize', requestDepth, { passive: true });
motion.addEventListener('change', () => {
  if (motion.matches && image) image.style.transform = '';
  requestDepth();
});
requestDepth();

// Animate only newly entering content. Nothing is made invisible in advance,
// so interrupted navigation, keyboard focus and a failed script remain safe.
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting);
    visible.forEach((entry, index) => {
      observer.unobserve(entry.target);
      if (motion.matches || entry.boundingClientRect.top < 120) return;
      entry.target.animate([
        { opacity: .65, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 620, delay: Math.min(index, 3) * 48, easing: 'cubic-bezier(.23,1,.32,1)' });
    });
  }, { threshold: .08 });
  document.querySelectorAll('.realm-card, .place-art-link, .place-copy, .related-place, .illustrated-section > *, .story-page .prose > section').forEach(node => observer.observe(node));
  motion.addEventListener('change', () => {
    if (motion.matches) document.getAnimations().forEach(animation => animation.finish());
  });
}
