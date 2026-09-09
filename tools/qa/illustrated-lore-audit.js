// Runs in the local QA page, against real same-origin pages and CSS.
const start = document.querySelector('button');
const report = document.querySelector('pre');
const frame = document.querySelector('iframe');
const paths = JSON.parse(document.querySelector('#paths').textContent);
const nextPaint = win => new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));

start.addEventListener('click', async () => {
  start.disabled = true;
  const results = [];
  try {
    for (const width of [320, 390, 768, 1440]) {
      frame.style.width = width + 'px';
      for (const path of paths) {
        report.textContent = `Checking ${width}px: ${path}\n${results.length} pages checked`;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Timed out: ${path}`)), 15000);
          frame.onload = () => { clearTimeout(timer); resolve(); };
          frame.src = path;
        });
        const win = frame.contentWindow, doc = frame.contentDocument;
        await doc.fonts.ready;
        await nextPaint(win);
        const cover = doc.querySelector('.page-cover');
        const title = doc.querySelector('h1');
        const label = cover?.querySelector('figcaption');
        const image = cover?.querySelector('img');
        const coverRect = cover?.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const labelRect = label?.getBoundingClientRect();
        const labelTop = labelRect ? doc.elementFromPoint(labelRect.x + labelRect.width / 2, labelRect.y + labelRect.height / 2) : null;
        const errors = [];
        if (doc.documentElement.scrollWidth > win.innerWidth + 1) errors.push('Horizontal page overflow');
        if (!title || titleRect.top < coverRect.top - 1 || titleRect.bottom > coverRect.bottom + 1) errors.push('Cover title clipped');
        if (!image?.complete || !image.naturalWidth) errors.push('Cover image missing');
        if (!label || !label.contains(labelTop)) errors.push('Concept label obscured');
        if (!doc.querySelector('.atlas-footer')?.textContent.includes('not a gameplay screenshot')) errors.push('Concept disclosure missing');
        results.push({ path, width, documentWidth: doc.documentElement.scrollWidth, errors });
      }
    }
    const evidence = { checkedAt: new Date().toISOString(), browser: 'Existing Brave window', checks: results.length, widths: [320, 390, 768, 1440], failures: results.filter(result => result.errors.length), results };
    const saved = await fetch('/audit-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evidence) });
    if (!saved.ok) throw new Error('Could not save local audit evidence');
    report.textContent = JSON.stringify({ checks: evidence.checks, widths: evidence.widths, failures: evidence.failures, evidence: 'outputs/lore-browser-audit.json' }, null, 2);
  } catch (error) { report.textContent = 'Audit failed: ' + error.message; }
  finally { start.disabled = false; }
});
