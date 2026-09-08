import './base.css';
import { mountCharacters } from './characters.js';
import { mountMotion } from './motion.js';

const lifecycle = new AbortController();
mountCharacters(document.querySelector('.calling'), lifecycle.signal);
mountMotion(lifecycle.signal);

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
// Observe sections, since the mobile character layout uses display: contents
// for its copy group and that group itself has no intersection rectangle.
document.querySelectorAll('main > section').forEach((element) => reveal.observe(element));
document.documentElement.classList.add('js');

const navigation = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    document.querySelectorAll('.site-header nav a').forEach((link) => {
      if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
}, { threshold: .3 });
document.querySelectorAll('#world, #calling').forEach((element) => navigation.observe(element));

function dispose() {
  lifecycle.abort();
  reveal.disconnect();
  navigation.disconnect();
}
if (import.meta.hot) import.meta.hot.dispose(dispose);
