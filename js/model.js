document.addEventListener("DOMContentLoaded", async () => {
  const mv = document.getElementById("model-viewer");
  if (!mv) return;

  let lang = localStorage.getItem("language") || "de";

  const hotspotConfig = [
    { slot: "hotspot-1", pos: "0 32 0", normal: "0 1 0", textKey: "hotspot1" },
    {
      slot: "hotspot-2",
      pos: "-6 57 10",
      normal: "0 1 0",
      textKey: "hotspot2",
    },
    {
      slot: "hotspot-3",
      pos: "-18 32 -10",
      normal: "0 1 0",
      textKey: "hotspot3",
    },
    { slot: "hotspot-4", pos: "1 2 -2", normal: "0 0 0", textKey: "hotspot4" },
  ];

  let t = {};
  try {
    const resp = await fetch(`lang/${lang}.json?cb=${Date.now()}`);
    t = await resp.json();
  } catch (e) {
    console.warn("Sprachdatei konnte nicht geladen werden:", e);
  }

  const hotspotTexts = t.hotspots || {};
  const closeText = t.close || "Schließen";

  Array.from(mv.querySelectorAll('button[slot^="hotspot-"]')).forEach((btn) =>
    btn.remove()
  );

  hotspotConfig.forEach(({ slot, pos, normal, textKey }) => {
    const btn = document.createElement("button");
    btn.setAttribute("slot", slot);
    btn.setAttribute("data-position", pos);
    btn.setAttribute("data-normal", normal);
    btn.style =
      "background: #00883A; border-radius: 50%; width: 32px; height: 32px; border: none; cursor: pointer;";
    btn.onclick = function () {
      document.getElementById("hotspot-text").textContent =
        hotspotTexts[textKey] || "";
      document.getElementById("hotspot-close").textContent = closeText;
      document.getElementById("hotspot-popup").style.display = "block";
    };
    mv.appendChild(btn);
  });
});
