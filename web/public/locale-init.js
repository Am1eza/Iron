(function () {
  try {
    var SUPPORTED = ['fa', 'en', 'ar', 'zh'];
    var RTL = { fa: true, ar: true };
    var m = document.cookie.match(/(?:^|; )ahantime_locale=([^;]+)/);
    var locale = m ? decodeURIComponent(m[1]) : 'fa';
    if (SUPPORTED.indexOf(locale) === -1) locale = 'fa';
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
