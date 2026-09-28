// Applies the saved light/dark theme before first paint (kept external so the CSP needs no 'unsafe-inline' scripts).
try {
  var t = localStorage.getItem('itsoc-theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch {
  // Storage unavailable (private mode): fall back to the default theme.
}
