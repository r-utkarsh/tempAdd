"use strict";
(() => {
  const script = document.createElement("script");
  script.textContent = "window.tempaddExtensionInstalled = true;";
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
