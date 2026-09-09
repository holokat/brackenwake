/** Only actual boot completion dismisses the initial HTML loading screen. */
export async function runBoot(boot, report = detail => {
  window.dispatchEvent(new CustomEvent('brackenwake:boot', { detail }));
}) {
  report({ phase: 'world' });
  try {
    const app = await boot();
    if (app?.loadingError) {
      report({ phase: 'failed', error: 'Greenwold could not be loaded. The terrain request did not complete successfully.' });
    } else if (app) {
      report({ phase: 'ready' });
    }
    // A null result can be the welcome-page redirect. Keep the cover in place.
    return app;
  } catch (error) {
    report({ phase: 'failed', error });
    throw error;
  }
}
