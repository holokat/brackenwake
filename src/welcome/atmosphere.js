// A single small canvas draws pollen and foreground leaves. It never owns a
// frame loop: the page controller stops all animation together when paused.
export function createAtmosphere(canvas) {
  const context = canvas.getContext('2d', { alpha: true });
  let width = 0;
  let height = 0;
  let particles = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: width < 700 ? 26 : 54 }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: index < 7 ? 5 + Math.random() * 6 : .6 + Math.random() * 1.6,
      speed: .25 + Math.random() * .75,
      phase: Math.random() * Math.PI * 2,
      leaf: index < (width < 700 ? 4 : 7),
    }));
  }

  function clear() { context?.clearRect(0, 0, width, height); }

  function draw(time, delta, worldVisible) {
    if (!context) return;
    clear();
    for (const particle of particles) {
      particle.x += delta * .008 * particle.speed;
      particle.y -= delta * .009 * particle.speed;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.x > width + 20) particle.x = -20;
      const sway = Math.sin(time * .00035 + particle.phase);
      const alpha = (.25 + Math.sin(time * .0008 + particle.phase) * .17);
      context.save();
      context.translate(particle.x + sway * 26, particle.y);
      if (particle.leaf) {
        context.globalAlpha = worldVisible ? .48 : .12;
        context.rotate(time * .0002 + particle.phase);
        context.scale(Math.sin(time * .0007 + particle.phase) * .4 + .6, 1);
        context.fillStyle = particle.phase > 3 ? '#c5b965' : '#7c9950';
        context.beginPath();
        context.moveTo(0, -particle.size);
        context.lineTo(particle.size * .65, -particle.size * .2);
        context.lineTo(particle.size * .35, particle.size * .65);
        context.lineTo(0, particle.size);
        context.lineTo(-particle.size * .4, 0);
        context.closePath();
        context.fill();
      } else {
        context.globalAlpha = alpha;
        context.fillStyle = worldVisible ? '#fff1b3' : '#dfd4a0';
        context.beginPath();
        context.arc(0, 0, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  resize();
  return { draw, resize, clear };
}
