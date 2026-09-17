(function () {
  try {
    // Non-default locales are URL-prefixed (`/en/...`, `/ar/...`, `/zh/...`);
    // fa (default) is served bare — see i18n/routing.ts's `localePrefix:
    // 'as-needed'`. The server already rendered the CORRECT lang/dir/text for
    // whichever of those this request's URL names (app/[locale]/layout.tsx
    // resolves it from the path, not a cookie) — the only reason this script
    // exists is that the outer root layout (app/layout.tsx) can't read that
    // child route param and must emit a static `lang="fa" dir="rtl"` shell.
    // So this must mirror the URL, not guess from a cookie/browser language:
    // a fa-browser visitor on `/en/...` (or vice versa) would otherwise get
    // `dir` that disagrees with the already-rendered, correctly-translated
    // page — exactly the "راست‌چین/چپ‌چین به‌هم‌ریخته" symptom this fixes.
    // (The old cookie this read, `ahantime_locale`, is dead: nothing writes
    // it anymore — LocaleSwitcher navigates to the other locale's real URL
    // via next-intl's own router instead of flipping client state.)
    var RTL = { fa: true, ar: true };
    var PREFIXED = ['en', 'ar', 'zh'];
    var path = location.pathname;
    var locale = 'fa';
    for (var i = 0; i < PREFIXED.length; i++) {
      var p = '/' + PREFIXED[i];
      if (path === p || path.indexOf(p + '/') === 0) {
        locale = PREFIXED[i];
        break;
      }
    }
    // Write ONLY on a real change. The server already emits lang="fa"
    // dir="rtl" (app/layout.tsx), so for the ~all-Persian traffic these were
    // no-op assignments that still invalidated style for the whole document:
    // profiled at ~124ms of bootup and a 127ms long task, from a 500-byte
    // script, on every page load.
    var el = document.documentElement;
    var dir = RTL[locale] ? 'rtl' : 'ltr';
    if (el.lang !== locale) el.lang = locale;
    if (el.dir !== dir) el.dir = dir;
  } catch (e) {
    /* no-op — worst case is a single-frame wrong lang/dir, never a crash */
  }
})();
