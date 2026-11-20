// Apply the saved theme before first paint so pages don't flash.
// Matches App.tsx: "light" | "dark" | "system", default dark.
(function () {
  try {
    var pref = localStorage.getItem("theme") || "dark";
    var light = pref === "light" || (pref === "system" && matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
  } catch (e) {}
})();
