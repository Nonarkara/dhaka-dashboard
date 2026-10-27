// Wada Sanzo palette and theme manager for DHKx.
(function () {
  "use strict";
  const themes = ["dark", "light", "contrast"];
  let selected;
  try { selected = localStorage.getItem("dhaka-atlas-theme"); } catch (e) {}
  if (!themes.includes(selected)) {
    selected = window.matchMedia("(prefers-contrast: more)").matches
      ? "contrast"
      : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "dark"; // Default to coastal/delta dark for rich spatial contrast
  }
  function apply(theme, persist) {
    if (!themes.includes(theme)) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
    if (persist) {
      try { localStorage.setItem("dhaka-atlas-theme", theme); } catch (e) {}
    }
    const select = document.getElementById("atlas-theme");
    if (select) select.value = theme;
    window.dispatchEvent(new CustomEvent("atlas:theme", { detail: theme }));
  }
  apply(selected, false);
  document.addEventListener("DOMContentLoaded", function () {
    const select = document.getElementById("atlas-theme");
    if (!select) return;
    select.value = document.documentElement.dataset.theme;
    select.addEventListener("change", function () { apply(select.value, true); });
  });
})();
