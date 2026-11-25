// Dark mode before the first paint (see src/theme.js); the sign-in pages stay light.
try {
  var t = localStorage.getItem("saleshub.theme");
  var dark = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark && !/^\/(login|forgot|reset-password|session-expired)/.test(location.pathname)) document.documentElement.classList.add("dark");
} catch (e) {}
