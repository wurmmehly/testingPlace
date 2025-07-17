const RAD2DEG = 180 / Math.PI;
const DEG2RAD = 1 / RAD2DEG;
const LANG = localStorage.getItem("language");
const urlParams = new URLSearchParams(window.location.search);
const locationName = urlParams.get("loc");

var location;
var FRAUNHOFER;

// RA & Dec für die Mitte der Galaxie und
// Diese werden benutzt den Himmel zu orientieren
galacticCenterRaDec = {
  ra: 17.76033255266667, // dezimalle Stunden
  dec: -28.93617776, // dezimalle Grade
};
longitude90RaDec = {
  ra: 21.20029210066667, // dezimalle Stunden
  dec: 48.32963721, // dezimalle Grade
};

// wie weit vom Teleskop Objekte im Himmel stehen sollen
const CELESTIAL_SPHERE_RADIUS = 400;

// wie weit das Teleskop hoch und runter drehen kann
const MIN_ALT = 0;
const MAX_ALT = 90;

// wenn delta weniger als diesen Nummer ist, wird die Bewegung ignoriert
const TINY_DELTA = 1e-6;

// wie schnell das Teleskop dreht, wenn es sich selbst bewegt
const TELESCOPE_NATURAL_SPEED = 1;

// wie schnell das Teleskop dreht, wenn man es bewegt
const EASING = 1;

// lädt Promises für jede Datei
const langPromise = fetch(`lang/${LANG}.json`).then((response) => response.json());
const geoCoordsPromise = fetch("./resources/geoCoords.json").then((response) => response.json());
const skyCoordsPromise = fetch("./resources/skyCoords.json").then((response) => response.json());

// Globales Objekt für die Waypoints und deren Koordinaten
var waypoints = {};
var waypointAzAlt = {};

// WICHTIG: RA muss in dezimallen Stunden sein und Dec muss in dezimallen Graden sein
function radec2azalt(radec, observer, time = null) {
  observation = new Orb.Observation({
    observer: observer,
    target: radec,
  });

  if (!time) time = new Date();
  var azalt = observation.azel(time);

  return {
    alt: azalt.elevation,
    az: azalt.azimuth > 180 ? azalt.azimuth - 360 : azalt.azimuth,
  };
}

// Umrechnet Koordinaten von Azimut und Elevation nach kartesisch Koordinaten (wie A-Frame)
function azalt2xyz(azalt, r) {
  const altitudeRadius = r * Math.cos(azalt.az * DEG2RAD);
  return {
    x: altitudeRadius * Math.sin(azalt.az * DEG2RAD),
    y: r * Math.sin(azalt.alt * DEG2RAD),
    z: -altitudeRadius * Math.cos(azalt.az * DEG2RAD),
  };
}

// Rechnet den Betrag eines Vektores
function magnitude(vec) {
  return (vec.x ** 2 + vec.y ** 2 + vec.z ** 2) ** 0.5;
}

// Rechnet das Punktprodukt für 2 Vektoren
function dot(vec1, vec2) {
  return vec1.x * vec2.x + vec1.y * vec2.y + vec1.z * vec2.z;
}

// Benutzt das Punktprodukt, um den Winkel zwischen 2 Vektoren zu rechnen
// Rückwert in Grad
function angleBetweenVectors(vec1, vec2) {
  return RAD2DEG * Math.acos(dot(vec1, vec2) / (magnitude(vec1) * magnitude(vec2)));
}

// Haversine - Entfernung
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function signOf(num) {
  return num < 0 ? -1 : 1;
}

function capSpeed(delta, max = null) {
  if (max !== null && Math.abs(delta) > max) delta = signOf(delta) * max;
  return delta;
}

// Hält die Rotation in Grad zwischen -180 und 180
function modulateRotation(degrees) {
  const initiallyNeg = degrees < 0;

  if (initiallyNeg) {
    degrees = 180 - degrees;
  }

  degrees = degrees % 360;

  if (initiallyNeg) {
    degrees = 180 - degrees;
  }

  return degrees;
}

function setAttributes(element, attributes) {
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, value);
  }
  return element;
}

function createElement(tagName, attributes) {
  return setAttributes(document.createElement(tagName), attributes);
}

function animate(element, property, val, animationOverrides = {}) {
  var animationProps = {
    property: property,
    to: val,
    dur: 200,
    easing: "easeInOutQuad",
  };

  for (const [override, value] of Object.entries(animationOverrides)) {
    animationProps[override] = value;
  }

  element.setAttribute(`animation__${property}`, animationProps);
}

function openInfoPanel(object) {
  document.querySelector("#fader").setAttribute("visible", true);

  infoPanelContainer = document.querySelector("#infoPanelContainer");
  infoPanelContainer.append(
    createElement("iframe", {
      id: "infoPanel",
      src: "./object.html?id=" + object.id,
    })
  );

  closeInfoPanelButton = createElement("button", {
    id: "closeInfoPanel",
    onclick: "closeInfoPanel()",
  });
  closeInfoPanelButton.innerText = "X";
  infoPanelContainer.append(closeInfoPanelButton);
}

function closeInfoPanel() {
  infoPanel = document.querySelector("#infoPanel");
  if (infoPanel) infoPanel.remove();
  closeInfoPanelButton = document.querySelector("#closeInfoPanel");
  if (closeInfoPanelButton) closeInfoPanelButton.remove();
  document.querySelector("#fader").setAttribute("visible", false);
}

//
// Lädt die Waypoints, auf die das Teleskop zeigt
//
AFRAME.registerComponent("load-sky", {
  init: function () {
    this.primaryMirror = document.querySelector("#primaryMirror");

    this.overlay = document.querySelector("#overlay");
    this.readMoreContainer = this.overlay.querySelector("#readMoreContainer");

    this.openHologramPanel = this.openHologramPanel.bind(this);
    this.highlightWaypoint = this.highlightWaypoint.bind(this);
    this.closeHologramPanel = this.closeHologramPanel.bind(this);

    this.tickCount = 0;

    skyCoordsPromise.then((skyCoords) => {
      const assets = document.querySelector("a-assets");
      for (const objectId of Object.keys(skyCoords)) {
        this.addWaypoint(objectId, assets);
      }
      this.updateWaypointsPos();
    });

    document.querySelector("a-camera").emit("skyloaded", {}, false);
  },

  tick: function () {
    // Rechnet die Az-Alt Koordinaten der Waypoints nur alle 100 Ticks
    if (this.tickCount < 100) {
      this.tickCount++;
    } else {
      this.updateWaypointsPos();
      this.tickCount = 0;
    }
  },

  //
  // Bewegt die Waypoints zu ihre echte Standorten
  //
  updateWaypointsPos: function () {
    geoCoordsPromise.then((geoCoords) => {
      skyCoordsPromise.then((skyCoords) => {
        for (const [objectId, els] of Object.entries(waypoints)) {
          coords = radec2azalt(skyCoords[objectId], geoCoords.fraunhofer);
          waypointAzAlt[objectId] = coords;
          els.azStick.setAttribute("rotation", { x: 0, y: -coords.az, z: 0 });
          els.altStick.setAttribute("rotation", { x: coords.alt, y: 0, z: 0 });
        }
      });
    });
  },

  //
  // Erstellt einen Waypoint und fügt ihn zum Himmel hinzu
  //
  addWaypoint: function (objectId, assets) {
    assets.append(
      createElement("img", {
        id: objectId + "Image",
        src: `./images/objects/${objectId}.webp`,
        crossorigin: "anonymous",
      })
    );

    var waypointAzStick = createElement("a-entity", {
      id: `${objectId}WaypointAzStick`,
    });

    var waypointAltStick = createElement("a-entity", {
      id: `${objectId}WaypointAltStick`,
    });

    var waypointFrameEl = createElement("a-entity", {
      id: objectId + "WaypointFrame",
      mixin: "waypointFrame",
      class: "waypoint",
      position: { x: 0, y: 0, z: -CELESTIAL_SPHERE_RADIUS },
    });

    var waypointImageEl = createElement("a-entity", {
      id: `${objectId}WaypointImage`,
      material: { src: `#${objectId}Image` },
      mixin: "waypointImage",
    });
    waypointFrameEl.appendChild(waypointImageEl);

    var waypointRaycastableEl = createElement("a-entity", {
      id: objectId,
      class: "raycastable",
      mixin: "waypointRaycastable",
      position: { x: 0, y: 0, z: -CELESTIAL_SPHERE_RADIUS },
    });

    waypointRaycastableEl.addEventListener("locked-on-waypoint", this.openHologramPanel);
    waypointRaycastableEl.addEventListener("raycaster-intersected", this.highlightWaypoint);
    waypointRaycastableEl.addEventListener(
      "raycaster-intersected-cleared",
      this.closeHologramPanel
    );

    langPromise.then((langDict) => {
      waypointFrameEl.appendChild(
        this.createInfoHologram(objectId, langDict.skyObjects[objectId].name)
      );
    });

    waypoints[objectId] = {
      frame: waypointFrameEl,
      image: waypointImageEl,
      raycastable: waypointRaycastableEl,
      azStick: waypointAzStick,
      altStick: waypointAltStick,
    };

    waypointAltStick.append(waypointFrameEl);
    waypointAltStick.append(waypointRaycastableEl);
    waypointAzStick.append(waypointAltStick);
    this.el.append(waypointAzStick);
  },

  //
  // Erstellt ein "Info-Hologram", aber es zeigt nun nur den Name des Objekts an
  //
  createInfoHologram: function (objectId, title) {
    infoHologramEl = createElement("a-entity", {
      id: `${objectId}HologramPanel`,
      mixin: "hologramPanel",
    });

    infoHologramEl.appendChild(
      createElement("a-entity", {
        id: `${objectId}Title`,
        mixin: "hologramTitle",
        text: { value: title },
      })
    );

    return infoHologramEl;
  },

  //
  // Erstellt eine "Weiter-lesen" Taste
  //
  createReadMoreButton: function (objectId) {
    var readMoreEl = createElement("button", {
      id: "readMore",
      onclick: `openInfoPanel(${objectId})`,
    });
    langPromise.then((langDict) => {
      readMoreEl.textContent = langDict.readmore;
    });

    return readMoreEl;
  },

  //
  // Diese Methoden definizieren wie die Waypoints aussehen, abhängig von ob das Teleskop auf die zeigt
  //
  highlightWaypoint: function (evt) {
    animate(waypoints[evt.target.id].frame, "scale", {
      x: 1.2,
      y: 1.2,
      z: 1.2,
    });
  },

  openHologramPanel: function (evt) {
    for (const objectId of Object.keys(waypoints)) {
      if (objectId === evt.target.id) continue;

      var otherWaypointFrame = waypoints[objectId].frame;
      animate(otherWaypointFrame, "position", {
        x: 0,
        y: 0,
        z: -(CELESTIAL_SPHERE_RADIUS + 10),
      });
    }

    this.primaryMirror.setAttribute("mirror-rays", { number: 4 });

    var waypointFrame = waypoints[evt.target.id].frame;
    animate(waypointFrame, "scale", { x: 1.5, y: 1.5, z: 1.5 });
    waypointFrame.querySelector(`#${evt.target.id}HologramPanel`).setAttribute("visible", "true");

    var readMoreEl = this.overlay.querySelector("#readMore");
    if (readMoreEl) readMoreEl.remove();
    this.readMoreContainer.appendChild(this.createReadMoreButton(evt.target.id));
  },

  closeHologramPanel: function (evt) {
    for (const objectId of Object.keys(waypoints)) {
      if (objectId === evt.target.id) continue;

      var otherWaypointFrame = waypoints[objectId].frame;
      animate(otherWaypointFrame, "position", {
        x: 0,
        y: 0,
        z: -CELESTIAL_SPHERE_RADIUS,
      });
    }

    this.primaryMirror.setAttribute("mirror-rays", { number: 60 });

    var waypointFrame = waypoints[evt.target.id].frame;
    waypointFrame.querySelector(`#${evt.target.id}HologramPanel`).setAttribute("visible", "false");

    animate(waypointFrame, "scale", { x: 1, y: 1, z: 1 });

    closeInfoPanel();

    readMoreEl = this.readMoreContainer.querySelector("#readMore");
    if (readMoreEl) readMoreEl.remove();
  },
});

//
// Erlaubt die Kamera das Teleskop zu drehen, wenn die Maus geklickt wird.
// Soll auf dem <a-camera>-Element sein.
//
AFRAME.registerComponent("telescope-control", {
  init: function () {
    this.raycaster = this.el.components["raycaster"];
    this.fraunhoferRig = document.querySelector("#fraunhoferRig");
    this.fraunhoferTopPart = document.querySelector("#fraunhoferTopPart");
    this.fraunhoferTelescopeRig = this.fraunhoferTopPart.querySelector("#fraunhoferTelescopeRig");

    this.currentRay = { alt: 0, az: 0 };
    this.previousRay = { alt: 0, az: 0 };
    this.currentTelescope = this.getCurrentTelescopeDirection();

    this.active = this.wasActive = false;
    this.lockedOnWaypoint = false;

    // activate -- fängt an, das Teleskop manuell zu drehen
    this.el.addEventListener("mousedown", (evt) => {
      this.active = true;
      this.lockedOnWaypoint = false;
    });
    // deactivate -- hört auf, manuell zu drehen
    this.el.addEventListener("mouseup", (evt) => {
      this.active = this.wasActive = false;
      this.closestWaypoint = this.getClosestWaypoint();
    });

    this.el.addEventListener("skyloaded", (evt) => {
      this.closestWaypoint = this.getClosestWaypoint();
    });
  },

  tick: function () {
    this.currentTelescope = this.getCurrentTelescopeDirection();
    this.currentRay = this.getCurrentRayDirection();

    // Bevor die Elemente geladen werden, ihre Rotationen haben Werte von "NaN" -- an diese Fälle, mach nichts
    if (isNaN(this.currentTelescope.alt) || isNaN(this.currentRay.alt)) return;

    if (this.active) {
      this.controlTelescope(); // manuell drehen
    } else if (this.closestWaypoint && !this.lockedOnWaypoint) {
      this.moveTelescopeToClosestWaypoint(); // automatisch drehen
    }
  },

  //
  // Diese Methoden behandeln wie das Teleskop drehen soll
  //

  // Dreht das Teleskop manuell
  controlTelescope: function () {
    if (this.wasActive) {
      this.updateTelescopeAltitude((this.currentRay.alt - this.previousRay.alt) * EASING);
      this.updateTelescopeAzimuth((this.currentRay.az - this.previousRay.az) * EASING);
    }

    this.previousRay = this.currentRay;
    this.wasActive = true;
  },

  // Dreht das Teleskop automatisch zu den nähesten Waypoint
  moveTelescopeToClosestWaypoint: function () {
    deltaAlt = modulateRotation(
      waypointAzAlt[this.closestWaypoint].alt - this.currentTelescope.alt
    );
    deltaAz = modulateRotation(waypointAzAlt[this.closestWaypoint].az - this.currentTelescope.az);

    if (Math.abs(deltaAlt) < TINY_DELTA && Math.abs(deltaAz) < TINY_DELTA) {
      this.lockedOnWaypoint = true;
      waypoints[this.closestWaypoint].raycastable.emit("locked-on-waypoint", {}, false);
    } else {
      this.updateTelescopeAltitude(deltaAlt, TELESCOPE_NATURAL_SPEED);
      this.updateTelescopeAzimuth(deltaAz, TELESCOPE_NATURAL_SPEED);
    }
  },

  //
  // Diese Methoden behandeln die Bewegungen des Teleskops
  //
  updateTelescopeAltitude: function (delta, max = null) {
    delta = capSpeed(delta, max);

    var newTelescopeAlt = this.currentTelescope.alt + delta;

    if (newTelescopeAlt < MIN_ALT) {
      newTelescopeAlt = MIN_ALT;
    } else if (newTelescopeAlt > MAX_ALT) {
      newTelescopeAlt = MAX_ALT;
    }

    this.fraunhoferTelescopeRig.setAttribute("rotation", {
      x: newTelescopeAlt,
      y: 0,
      z: 0,
    });
  },

  updateTelescopeAzimuth: function (delta, max = null) {
    delta = capSpeed(delta, max);

    var newTelescopeAz = modulateRotation(-(this.currentTelescope.az + delta));

    this.fraunhoferTopPart.setAttribute("rotation", {
      x: 0,
      y: newTelescopeAz,
      z: 0,
    });
  },

  //
  // Diese Methoden gewinnen Infos wichtig fürs Funktionieren dieser Component
  //

  // gewinnt worauf die Kamera nun zeigt
  getCurrentRayDirection: function () {
    const dirVec = this.raycaster.data.direction;

    return {
      alt: Math.asin(dirVec.y / (dirVec.x ** 2 + dirVec.y ** 2 + dirVec.z ** 2) ** 0.5) * RAD2DEG,
      az: Math.atan2(dirVec.x, -dirVec.z) * RAD2DEG,
    };
  },

  // gewinnt worauf das Teleskop nun zeigt
  getCurrentTelescopeDirection: function () {
    return {
      alt: this.fraunhoferTelescopeRig.getAttribute("rotation").x,
      az: -this.fraunhoferTopPart.getAttribute("rotation").y,
    };
  },

  getClosestWaypoint: function () {
    closestWaypoint = null;
    closestDistance = 1000;

    for (const [objectId, coords] of Object.entries(waypointAzAlt)) {
      if (coords.alt < MIN_ALT) continue;

      deltaAlt = modulateRotation(coords.alt - this.currentTelescope.alt);
      deltaAz = modulateRotation(coords.az - this.currentTelescope.az);

      distance = (deltaAlt ** 2 + deltaAz ** 2) ** 0.5;

      if (distance < closestDistance) {
        closestWaypoint = objectId;
        closestDistance = distance;
      }
    }

    return closestWaypoint;
  },
});

AFRAME.registerComponent("handle-gps", {
  init: function () {
    telescope = this.el.querySelector("#fraunhoferRig");
    celestialSphere = this.el.querySelector("#celestialSphere");
    camera = this.el.querySelector("a-camera");

    if (!locationName) {
    }

    var gpsAvailable;
    var currentPos;
    navigator.geolocation.getCurrentPosition(
      (success) => {
        gpsAvailable = true;
        currentPos = success;
      },
      (failure) => {
        gpsAvailable = false;
      }
    );

    geoCoordsPromise.then((geoCoords) => {
      alt = geoCoords.fraunhofer.altitude;
      lat = geoCoords.fraunhofer.latitude;
      lon = geoCoords.fraunhofer.longitude;

      if (currentPos) {
        distance = getDistance(lat, lon, currentPos.latitude, currentPos.longitude);
      }
      boundary = 5;

      // wenn kein Ort definiziert wird und der Benutzer ist zu weit vom Fraunhofer, benutzt keine GPS-Koordinaten
      if (!locationName && (!gpsAvailable || (gpsAvailable && distance > boundary))) {
        return;
      }

      // wenn GPS-Koordinaten verfügbar sind und der Benutzer nah vom Fraunhofer ist, benutzt echte Koordinaten
      if (gpsAvailable && distance < boundary) {
        camera.setAttribute("gps-projected-camera");
      } else {
        // andersweise, wenn GPS nicht verfügbar ist oder der Benutzer ist zu weit vom Fraunhofer, benutzt falsche Koordinaten für die Kamera
        camera.setAttribute("gps-projected-camera", {
          simulateAltitude: geoCoords[locationName].altitude,
          simulateLatitude: geoCoords[locationName].latitude,
          simulateLongitude: geoCoords[locationName].longitude,
        });
      }

      // Setzt das Teleskop an seine richtige Stelle
      setAttributes(telescope, {
        position: { x: 0, y: alt, z: 0 },
        "gps-projected-entity-place": { latitude: lat, longitude: lon },
      });
      setAttributes(celestialSphere, {
        position: { x: 0, y: alt + 3.209, z: 0 },
        "gps-projected-entity-place": { latitude: lat, longitude: lon },
      });
    });
  },
});

//
// Zeigt an, wie Licht zwischen die Spiegel des Teleskops geht
//
AFRAME.registerComponent("mirror-rays", {
  schema: {
    number: { type: "number", default: 60 },
    start: { type: "vec3" },
    length: { type: "number" },
    tilt: { type: "number" },
  },

  init: function () {
    this.rays = [];
    this.rayContainers = [];

    this.addRays(this.data.number);
  },

  update: function () {
    this.removeAllRays();
    this.addRays(this.data.number);
    this.animate();
  },

  remove: function () {
    this.removeAllRays();
  },

  addRays: function (num) {
    const interval = 360 / num;
    var i = 0;
    while (i < num) {
      const rayContainer = createElement("a-entity", {
        rotation: { x: 0, y: i * interval, z: 0 },
      });
      const rayTiltContainer = createElement("a-entity", {
        position: this.data.start,
        rotation: { x: this.data.tilt, y: 0, z: 0 },
      });
      const ray = createElement("a-entity", {
        mixin: "mirrorRay",
        line: {
          start: { x: 0, y: 0, z: 0 },
          end: { x: 0, y: this.data.length, z: 0 },
        },
      });
      this.rays.push(ray);
      this.rayContainers.push(rayContainer);

      rayTiltContainer.append(ray);
      rayContainer.append(rayTiltContainer);
      this.el.append(rayContainer);
      i++;
    }
  },

  removeAllRays: function () {
    for (const rayContainer of this.rayContainers) {
      rayContainer.remove();
    }
    this.rays = [];
    this.rayContainers = [];
  },

  animate: function () {
    const segmentLength = 5;
    for (const ray of this.rays) {
      var rayHighlight = createElement("a-entity", {
        mixin: "mirrorRay",
        line: {
          start: { x: 0, y: 0, z: 0 },
          end: { x: 0, y: segmentLength, z: 0 },
          opacity: 1,
        },
        position: { x: 0, y: 0, z: 0 },
        animation: {
          property: "position",
          to: {
            x: 0,
            y: this.data.length - segmentLength,
            z: 0,
          },
          dur: 2000,
          easing: "linear",
          loop: true,
        },
      });
      ray.after(rayHighlight);
    }
  },
});

AFRAME.registerComponent("sky-background", {
  init: function () {
    this.skyRotator = this.el.querySelector("#skyRotator");
    this.galaxyRoller = this.skyRotator.querySelector("#galaxyRoller");
    this.skyEl = this.galaxyRoller.querySelector("a-sky");
    this.tickCount = 0;
  },

  tick: function () {
    if (this.tickCount == 0) {
      this.updateSky();
    } else if (this.tickCount >= 100) {
      this.tickCount = 0;
    } else {
      this.tickCount++;
    }
  },

  // Wir nutzen die Milchstraße um den Himmel richtig zu drehen.
  updateSky: function () {
    geoCoordsPromise.then((geoCoords) => {
      galacticCenterAzAlt = radec2azalt(galacticCenterRaDec, geoCoords.fraunhofer);
      longitude90AzAlt = radec2azalt(longitude90RaDec, geoCoords.fraunhofer);

      // Gewinnt Vektoren dafür, wo der Punkt von 90 Grad galaktische Länge nun ist, und wo er sein soll
      // Der Winkel dazwischen kann benutzt werden, um den Himmel richtig zu orientieren
      const referenceVec = azalt2xyz({ az: galacticCenterAzAlt.az - 90, alt: 0 }, 1);
      const longitude90Vec = azalt2xyz(longitude90AzAlt, 1);
      const galacticRoll = -angleBetweenVectors(referenceVec, longitude90Vec);

      this.galaxyRoller.setAttribute("rotation", { x: galacticRoll, y: 0, z: 0 });
      this.skyRotator.setAttribute("rotation", {
        x: 0,
        y: -galacticCenterAzAlt.az,
        z: -galacticCenterAzAlt.alt,
      });
    });
  },
});
