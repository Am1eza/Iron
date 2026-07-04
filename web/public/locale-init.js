(function () {
  try {
    var SUPPORTED = ['fa', 'en', 'ar', 'zh'];
    var RTL = { fa: true, ar: true };
    var m = document.cookie.match(/(?:^|; )ahantime_locale=([^;]+)/);
    var locale = m ? decodeURIComponent(m[1]) : 'fa';
    if (SUPPORTED.indexOf(locale) === -1) locale = 'fa';
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL[locale] ? 'rtl' : 'ltr';
  } catch (e) {
    /* no-op — worst case is a single-frame wrong lang/dir, never a crash */
  }
})();
