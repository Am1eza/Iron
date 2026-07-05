(function () {
  try {
    // Brand decision: the site is light-only for visitors. Previously this
    // honored a persisted choice and fell back to the OS
    // `prefers-color-scheme`, which silently rendered the whole site dark for
    // every dark-OS visitor even though light is the designed default and no
    // user-facing toggle exists (ThemeToggle only renders on /styleguide).
    // Dark tokens remain in tokens.css for the styleguide/dev toggle, but
    // first paint is always light. The ui store (v2 migration) resets any
    // previously auto-persisted "dark" the OS guess left behind.
    document.documentElement.dataset.theme = 'light';
  } catch (e) {
    /* no-op — worst case is a single-frame FOUC, never a crash */
  }
})();
