(function () {
  try {
    var t = null;
    var raw = localStorage.getItem('ahantime-ui');
    if (raw) {
      var s = JSON.parse(raw);
      t = s && s.state && s.state.theme;
    }
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = t;
  } catch (e) {
    /* no-op — worst case is a single-frame FOUC, never a crash */
  }
})();
