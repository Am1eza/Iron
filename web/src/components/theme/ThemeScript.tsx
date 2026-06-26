/**
 * No-flash theme bootstrap. Runs before first paint to set `:root[data-theme]`
 * from the persisted preference (the `ahantime-ui` Zustand store), falling back to
 * the OS `prefers-color-scheme`. Prevents a light→dark flash on load (FOUC).
 * <StoreHydrator/> keeps it in sync afterwards.
 */
const SCRIPT = `(function(){try{
  var t=null;
  var raw=localStorage.getItem('ahantime-ui');
  if(raw){var s=JSON.parse(raw);t=s&&s.state&&s.state.theme;}
  if(t!=='light'&&t!=='dark'){
    t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  }
  document.documentElement.dataset.theme=t;
}catch(e){}})();`;

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
