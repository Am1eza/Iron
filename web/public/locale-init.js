(function () {
  try {
    var SUPPORTED = ['fa', 'en', 'ar', 'zh'];
    var RTL = { fa: true, ar: true };
    var m = document.cookie.match(/(?:^|; )ahantime_locale=([^;]+)/);
    var locale = m ? decodeURIComponent(m[1]) : null;
    if (locale && SUPPORTED.indexOf(locale) === -1) locale = null;
    if (!locale) {
      // No cookie yet — a visitor who has never chosen a language. Try the
      // browser's own language list before falling back to fa, mirroring
      // LocaleProvider's client-side detection (see its header comment for
      // why this can't happen server-side without defeating ISR). Doing it
      // here too, not just in LocaleProvider, avoids a *second* flash where
      // `dir` (rtl/ltr) itself flips after first paint.
      var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < langs.length; i++) {
        var primary = (langs[i] || '').split('-')[0].toLowerCase();
        if (SUPPORTED.indexOf(primary) !== -1) {
          locale = primary;
          break;
        }
      }
      locale = locale || 'fa';
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
