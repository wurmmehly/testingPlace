const scenes = {
  "neu/Fenster2.jpg": {
    hotspots: [
      {
        position: "0 0 -5",
        target: "neu/gbunten.jpg",
        type: "image",
        gbu,
      },
      {
        position: "1 0 -5",
        target: "model.html",
        type: "page",
      },
    ],
  },
  "neu/gbunten.jpg": {
    hotspots: [
      {
        position: "2 1 -5",
        target: "neu/oben.jpg",
        type: "image",
      },
      {
        position: "-2 0 -4",
        target: "images/test1.jpg",
        type: "image",
      },
    ],
  },
  "images/test3.jpg": {
    hotspots: [
      {
        position: "0 1 -6",
        target: "images/test1.jpg",
        type: "image",
      },
    ],
  },
};

// Hotspot-Komponente
AFRAME.registerComponent("hotspot", {
  schema: {
    target: { type: "string" },
    targetType: { type: "string" },
  },
  init() {
    this.el.addEventListener("click", () => {
      if (this.data.targetType === "image") {
        document.querySelector("a-sky").setAttribute("src", this.data.target);
        this.el.remove();
        createHotspots(this.data.target);
      } else if (this.data.targetType === "page") {
        window.location.href = this.data.target;
      }
    });
  },
});

// Hotspots erzeugen
const createHotspots = (img) => {
  document.querySelectorAll(".hotspot").forEach((e) => e.remove());
  const sceneData = scenes[img];
  if (sceneData) {
    sceneData.hotspots.forEach(({ position, target, type }) => {
      const h = document.createElement("a-entity");
      h.setAttribute("geometry", "primitive: plane; height: 0.6; width: 0.6");
      h.setAttribute("material", "src: #stern; transparent: true");
      h.setAttribute("position", position);
      h.setAttribute("hotspot", { target: target, targetType: type });
      h.setAttribute("class", "hotspot");
      h.setAttribute("look-at", "[camera]");
      document.querySelector("a-scene").appendChild(h);
    });
  }
};

// Schnellauswahl erstellen
function createSceneSelector() {
  const selector = document.getElementById("scene-selector");

  for (const [img, data] of Object.entries(scenes)) {
    const button = document.createElement("button");
    button.className = "scene-button";
    button.textContent = data.description;
    button.onclick = () => {
      // Aktuelle Szene wechseln
      document.querySelector("a-sky").setAttribute("src", img);
      createHotspots(img);
    };
    selector.appendChild(button);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  createHotspots("images/test1.jpg");
});
