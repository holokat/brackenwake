import './base.css';
import { mountMotion } from './motion.js';
import { mountBackgroundVideo } from './video.js';

const lifecycle = new AbortController();
mountMotion(lifecycle.signal);
// The finished ambient loop shares the hero's visibility and disposal lifecycle.
mountBackgroundVideo(document.querySelector('.vista-video'), lifecycle.signal);

// The HTML is complete without JavaScript. Only hide reveal groups once their
// observer exists, so a failed script never leaves the entrance invisible.
const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('[data-reveal]').forEach((group) => group.classList.add('is-visible'));
      reveal.unobserve(entry.target);
    }
  }
}, { threshold: .12 });
document.querySelectorAll('main > section').forEach((element) => reveal.observe(element));
document.documentElement.classList.add('js');

function dispose() {
  lifecycle.abort();
  reveal.disconnect();
}
if (import.meta.hot) import.meta.hot.dispose(dispose);
