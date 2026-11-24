// ============================================================================
// StarTrace — High-FPS 3D-Shaded Solar Sector Engine & Aerospace DSA Controller
// ============================================================================

const API_BASE_URL = "http://localhost:8080/api";

let canvas, ctx;
let planetsData = [];
let edgesData = [];
let activeRouteData = null;
let mstData = null;

// Environment & Simulation State
let beltAsteroids = [];
let globalTime = 0;
let lastFrameTime = 0;
let showOrbits = true;
let showMST = false;
let shipPulseProgress = 0;
let mapRouteSchedule = [];
let mainLoopStarted = false;

// Pre-rendered Offscreen 3D Parallax Caches for 60+ FPS Performance
let bgDeepGalaxyCanvas = null;
let bgMidStarsCanvas = null;
let sunCacheCanvas = null;
let asteroidSprites = [];
let shipSpriteCanvas = null;
let sphereShadeSprite = null;
const planetTextureCache = new Map();

// Camera Pan & Zoom State
let zoom = 1.0;
let minZoom = 0.45;
let maxZoom = 3.2;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragMoved = false;

// Spacecraft Outfitting State
let maxFuelTons = 600;
let shieldBonus = 0.0;
let equippedUpgrades = new Set();

// Mapped Screen Coordinates for Hit Detection
let currentMappedPlanets = [];
let currentMappedEdges = [];
let hoveredEdge = null;
let hoveredPlanet = null;
let selectedDeckPlanet = null;
let deckAnimId = null;

// First-Person Starship Cockpit Simulation State
let cockpitCanvas = null;
let cockpitCtx = null;
let cockpitAnimId = null;
let cockpitOpen = false;
let cockpitPlaying = true;
let cockpitSpeedMult = 1;
let cockpitProgress = 0;
let cockpitLegs = [];
let cockpitStars = [];
let cockpitAsteroids = [];
let cockpitLookX = 0;
let cockpitLookY = 0;
let cockpitTargetLookX = 0;
let cockpitTargetLookY = 0;
let cockpitLastTime = 0;

// Realistic Spacecraft Supplies & Upgrades Catalog (Priced in $)
const shipSuppliesCatalog = [
    {
        id: "sup_fuel_pod",
        name: "Cryogenic Auxiliary Tank (+350 t)",
        effect: "Increases max propellant capacity by +350 Metric Tons",
        price: 18500,
        apply: () => {
            maxFuelTons += 350;
            const fuelInput = document.getElementById("fuelTankInput");
            if (fuelInput) fuelInput.value = maxFuelTons;
            updateShipHUD();
        }
    },
    {
        id: "sup_rad_shield",
        name: "Class-4 Magnetospheric Deflector",
        effect: "Reduces cosmic & solar radiation exposure by 35%",
        price: 24000,
        apply: () => {
            shieldBonus = Math.min(0.75, shieldBonus + 0.35);
            updateShipHUD();
        }
    },
    {
        id: "sup_laser_comms",
        name: "Quantum Optical Transceiver",
        effect: "Stabilizes deep-space telemetry & navigation lock",
        price: 12000,
        apply: () => {
            showNotification("Quantum Optical Transceiver online: Deep-space telemetry lock stabilized.", "info");
        }
    },
    {
        id: "sup_fusion_injector",
        name: "Deuterium Torch Afterburner",
        effect: "Adds +200 t reserve propellant & high-impulse trim",
        price: 15500,
        apply: () => {
            maxFuelTons += 200;
            const fuelInput = document.getElementById("fuelTankInput");
            if (fuelInput) fuelInput.value = maxFuelTons;
            updateShipHUD();
        }
    }
];

function initStarTraceApp() {
    buildStaticSprites();
    runCinematicBootSequence();

    canvas = document.getElementById("galaxyCanvas");
    if (canvas) {
        ctx = canvas.getContext("2d", { alpha: false });
        resizeCanvas();
        window.addEventListener("resize", () => {
            resizeCanvas();
            if (cockpitOpen) resizeCockpitCanvas();
        });
        setupCanvasInteractions();
    }

    setupControlListeners();
    setupCockpitListeners();
    loadInitialNetworkData();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initStarTraceApp);
} else {
    initStarTraceApp();
}

// ============================================================================
// 1. Cinematic Space Boot Sequence
// ============================================================================
function runCinematicBootSequence() {
    const overlay = document.getElementById("bootOverlay");
    const fill = document.getElementById("bootProgressFill");
    const status = document.getElementById("bootStatusText");
    if (!overlay || !fill) {
        startMainLoop();
        return;
    }

    const steps = [
        { pct: 35, msg: "INITIALIZING KEPLERIAN ORBITAL MECHANICS..." },
        { pct: 72, msg: "SYNTHESIZING 3D PLANETARY TEXTURES & STARSHIP..." },
        { pct: 100, msg: "SOLAR SECTOR TELEMETRY ONLINE." }
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
        if (stepIdx < steps.length) {
            fill.style.width = steps[stepIdx].pct + "%";
            if (status) status.innerText = steps[stepIdx].msg;
            stepIdx++;
        } else {
            clearInterval(interval);
            startMainLoop();
            setTimeout(() => {
                overlay.classList.add("fade-out");
                setTimeout(() => overlay.remove(), 700);
            }, 220);
        }
    }, 280);
}

// ============================================================================
// 2. Data Loading from Spring Boot Backend
// ============================================================================
async function loadInitialNetworkData() {
    try {
        const [planetsRes, edgesRes] = await Promise.all([
            fetch(`${API_BASE_URL}/planets`),
            fetch(`${API_BASE_URL}/edges`)
        ]);

        if (!planetsRes.ok || !edgesRes.ok) throw new Error("Backend offline");

        planetsData = await planetsRes.json();
        edgesData = await edgesRes.json();

        planetsData.forEach(p => getPlanetTexture(p));
        populateStationControls(planetsData);
        populateEdgeSelector(edgesData);
        refreshLeaderboard();
    } catch (err) {
        console.error(err);
        showNotification("Cannot connect to StarTrace Java Backend on port 8080.", "error");
    }
}

function populateStationControls(planets) {
    const startSel = document.getElementById("startPlanet");
    const destSel = document.getElementById("destPlanet");
    const wpContainer = document.getElementById("waypointCheckboxes");

    if (startSel && destSel) {
        startSel.innerHTML = '<option value="">Select Origin Station...</option>';
        destSel.innerHTML = '<option value="">Select Destination Station...</option>';

        planets.forEach(p => {
            const label = `${p.id} — ${p.name}${p.hasRefuelDepot ? " [REFUEL]" : ""}`;
            startSel.add(new Option(label, p.id));
            destSel.add(new Option(label, p.id));
        });

        startSel.value = "P3";
        destSel.value = "P10";
    }

    if (wpContainer) {
        wpContainer.innerHTML = planets.map((p, idx) => `
            <label class="wp-check-item">
                <input type="checkbox" value="${p.id}" ${idx === 2 || idx === 4 || idx === 5 || idx === 7 ? "checked" : ""}>
                <span>${p.id} ${p.name.split(" ")[0]}</span>
            </label>
        `).join("");
    }
}

function populateEdgeSelector(edges) {
    const sel = document.getElementById("hazardEdgeSelect");
    if (!sel) return;
    sel.innerHTML = "";
    edges.forEach(e => {
        const statusTag = e.disrupted ? ` [STORM: ${e.disruptionReason}]` : "";
        sel.add(new Option(`${e.sourcePlanetId} ↔ ${e.targetPlanetId} (${e.baseDistanceMkm} Mkm)${statusTag}`, `${e.sourcePlanetId}|${e.targetPlanetId}`));
    });
}

// ============================================================================
// 3. Pre-Rendered 3D Sprites & Procedural Planetary Textures (60+ FPS)
// ============================================================================
function buildStaticSprites() {
    sunCacheCanvas = document.createElement("canvas");
    sunCacheCanvas.width = 160;
    sunCacheCanvas.height = 160;
    const sCtx = sunCacheCanvas.getContext("2d");
    const sc = 80;

    const corona = sCtx.createRadialGradient(sc, sc, 10, sc, sc, 74);
    corona.addColorStop(0, "rgba(254, 240, 138, 0.95)");
    corona.addColorStop(0.28, "rgba(245, 158, 11, 0.52)");
    corona.addColorStop(0.65, "rgba(234, 88, 12, 0.14)");
    corona.addColorStop(1, "rgba(234, 88, 12, 0)");
    sCtx.fillStyle = corona;
    sCtx.beginPath();
    sCtx.arc(sc, sc, 74, 0, Math.PI * 2);
    sCtx.fill();

    const core = sCtx.createRadialGradient(sc - 5, sc - 5, 2, sc, sc, 23);
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.45, "#fef08a");
    core.addColorStop(1, "#f59e0b");
    sCtx.fillStyle = core;
    sCtx.beginPath();
    sCtx.arc(sc, sc, 23, 0, Math.PI * 2);
    sCtx.fill();

    sphereShadeSprite = document.createElement("canvas");
    sphereShadeSprite.width = 180;
    sphereShadeSprite.height = 180;
    const shCtx = sphereShadeSprite.getContext("2d");
    const c = 90;
    const r = 88;

    const sunShade = shCtx.createRadialGradient(c + r * 0.48, c, r * 0.08, c, c, r * 1.48);
    sunShade.addColorStop(0.0, "rgba(255, 255, 245, 0.28)");
    sunShade.addColorStop(0.42, "rgba(255, 255, 255, 0.0)");
    sunShade.addColorStop(0.75, "rgba(3, 7, 18, 0.62)");
    sunShade.addColorStop(1.0, "rgba(1, 3, 9, 0.94)");
    shCtx.fillStyle = sunShade;
    shCtx.beginPath();
    shCtx.arc(c, c, r, 0, Math.PI * 2);
    shCtx.fill();

    const limbGrad = shCtx.createRadialGradient(c, c, r * 0.62, c, c, r);
    limbGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    limbGrad.addColorStop(1, "rgba(0, 0, 0, 0.46)");
    shCtx.fillStyle = limbGrad;
    shCtx.beginPath();
    shCtx.arc(c, c, r, 0, Math.PI * 2);
    shCtx.fill();

    shipSpriteCanvas = build3DSpacecraftSprite();

    asteroidSprites = ["#64748b", "#475569", "#52525b"].map(shade => {
        const ac = document.createElement("canvas");
        ac.width = 12;
        ac.height = 12;
        const actx = ac.getContext("2d");
        actx.translate(6, 6);
        actx.beginPath();
        const pts = [0.9, 1.15, 0.8, 1.1, 0.85, 1.05];
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const rad = 3.2 * pts[i];
            if (i === 0) actx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else actx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        actx.closePath();
        actx.fillStyle = shade;
        actx.fill();
        return ac;
    });
}

function build3DSpacecraftSprite() {
    const sc = document.createElement("canvas");
    sc.width = 110;
    sc.height = 110;
    const g = sc.getContext("2d");
    g.translate(55, 55);

    g.fillStyle = "#1e293b";
    g.strokeStyle = "#64748b";
    g.lineWidth = 1;
    g.fillRect(-25, -10, 8, 6);
    g.strokeRect(-25, -10, 8, 6);
    g.fillRect(-25, 4, 8, 6);
    g.strokeRect(-25, 4, 8, 6);

    g.fillStyle = "#38bdf8";
    g.fillRect(-26, -9, 2.5, 4);
    g.fillRect(-26, 5, 2.5, 4);

    const portWing = g.createLinearGradient(0, -30, 0, -4);
    portWing.addColorStop(0, "#94a3b8");
    portWing.addColorStop(0.5, "#e2e8f0");
    portWing.addColorStop(1, "#cbd5e1");
    g.fillStyle = portWing;
    g.beginPath();
    g.moveTo(8, -5);
    g.lineTo(-18, -28);
    g.lineTo(-23, -24);
    g.lineTo(-16, -6);
    g.closePath();
    g.fill();
    g.strokeStyle = "#475569";
    g.lineWidth = 0.8;
    g.stroke();

    const stbdWing = g.createLinearGradient(0, 4, 0, 30);
    stbdWing.addColorStop(0, "#94a3b8");
    stbdWing.addColorStop(0.5, "#64748b");
    stbdWing.addColorStop(1, "#334155");
    g.fillStyle = stbdWing;
    g.beginPath();
    g.moveTo(8, 5);
    g.lineTo(-18, 28);
    g.lineTo(-23, 24);
    g.lineTo(-16, 6);
    g.closePath();
    g.fill();
    g.strokeStyle = "#1e293b";
    g.lineWidth = 0.8;
    g.stroke();

    g.fillStyle = "#cbd5e1";
    g.beginPath();
    g.moveTo(21, -3);
    g.lineTo(12, -12);
    g.lineTo(10, -3);
    g.closePath();
    g.fill();

    g.fillStyle = "#64748b";
    g.beginPath();
    g.moveTo(21, 3);
    g.lineTo(12, 12);
    g.lineTo(10, 3);
    g.closePath();
    g.fill();

    const hullGrad = g.createLinearGradient(0, -8, 0, 8);
    hullGrad.addColorStop(0.0, "#ffffff");
    hullGrad.addColorStop(0.35, "#e2e8f0");
    hullGrad.addColorStop(0.72, "#64748b");
    hullGrad.addColorStop(1.0, "#1e293b");

    g.fillStyle = hullGrad;
    g.beginPath();
    g.moveTo(36, 0);
    g.quadraticCurveTo(24, -7, 4, -7);
    g.lineTo(-21, -6);
    g.lineTo(-21, 6);
    g.lineTo(4, 7);
    g.quadraticCurveTo(24, 7, 36, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = "#334155";
    g.lineWidth = 0.9;
    g.stroke();

    g.strokeStyle = "rgba(255, 255, 255, 0.85)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-18, -1.5);
    g.lineTo(26, -1.2);
    g.stroke();

    g.fillStyle = "#facc15";
    g.beginPath();
    g.moveTo(36, 0);
    g.lineTo(31, -2);
    g.lineTo(31, 2);
    g.closePath();
    g.fill();

    const canopyGrad = g.createLinearGradient(8, -4, 21, 4);
    canopyGrad.addColorStop(0, "#0284c7");
    canopyGrad.addColorStop(0.5, "#38bdf8");
    canopyGrad.addColorStop(1, "#e0f2fe");
    g.fillStyle = canopyGrad;
    g.beginPath();
    g.ellipse(15, 0, 6.5, 3.2, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = "#ef4444";
    g.beginPath();
    g.arc(-19, -26, 1.8, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = "#22c55e";
    g.beginPath();
    g.arc(-19, 26, 1.8, 0, Math.PI * 2);
    g.fill();

    return sc;
}

// Seamless Procedural Planetary Surface Texture Generator (256x128)
function getPlanetTexture(planet) {
    const key = planet.id || planet.name;
    if (planetTextureCache.has(key)) return planetTextureCache.get(key);

    const tc = document.createElement("canvas");
    tc.width = 256;
    tc.height = 128;
    const t = tc.getContext("2d");
    const w = tc.width;
    const h = tc.height;
    const name = (planet.name || "").toLowerCase();

    const drawWrappedBlob = (x, y, rx, ry, rot, color) => {
        t.fillStyle = color;
        [-w, 0, w].forEach(dx => {
            t.beginPath();
            t.ellipse(x + dx, y, rx, ry, rot, 0, Math.PI * 2);
            t.fill();
        });
    };

    const drawWrappedCrater = (x, y, r, darkCol, lightCol) => {
        [-w, 0, w].forEach(dx => {
            t.fillStyle = lightCol;
            t.beginPath();
            t.arc(x + dx + 1, y + 1, r, 0, Math.PI * 2);
            t.fill();
            t.fillStyle = darkCol;
            t.beginPath();
            t.arc(x + dx, y, r * 0.88, 0, Math.PI * 2);
            t.fill();
        });
    };

    if (name.includes("earth")) {
        const ocean = t.createLinearGradient(0, 0, 0, h);
        ocean.addColorStop(0, "#1d4ed8");
        ocean.addColorStop(0.5, "#0369a1");
        ocean.addColorStop(1, "#1e3a8a");
        t.fillStyle = ocean;
        t.fillRect(0, 0, w, h);

        const continents = [
            { x: 48, y: 42, rx: 22, ry: 16, rot: -0.3, c: "#15803d" },
            { x: 58, y: 52, rx: 14, ry: 10, rot: 0.2, c: "#65a30d" },
            { x: 68, y: 82, rx: 14, ry: 22, rot: 0.25, c: "#16a34a" },
            { x: 145, y: 38, rx: 32, ry: 16, rot: 0.1, c: "#15803d" },
            { x: 172, y: 44, rx: 24, ry: 14, rot: -0.15, c: "#4d7c0f" },
            { x: 142, y: 68, rx: 18, ry: 24, rot: 0.1, c: "#ca8a04" },
            { x: 144, y: 78, rx: 13, ry: 16, rot: 0.0, c: "#16a34a" },
            { x: 205, y: 88, rx: 14, ry: 10, rot: -0.2, c: "#b45309" }
        ];
        continents.forEach(c => drawWrappedBlob(c.x, c.y, c.rx, c.ry, c.rot, c.c));

        t.fillStyle = "#f8fafc";
        t.fillRect(0, 0, w, 10);
        t.fillRect(0, h - 11, w, 11);

        for (let i = 0; i < 18; i++) {
            drawWrappedBlob((i * 37) % w, 18 + ((i * 19) % 92), 26, 3.5, (i % 3 - 1) * 0.15, "rgba(255,255,255,0.42)");
        }
    } else if (name.includes("jupiter")) {
        const bands = [
            [0, 14, "#8c6d53"], [14, 14, "#f3e5ab"], [28, 16, "#b45309"],
            [44, 18, "#fef3c7"], [62, 16, "#9a3412"], [78, 18, "#fde68a"],
            [96, 16, "#a16207"], [112, 16, "#78350f"]
        ];
        bands.forEach(([y, bh, col]) => {
            t.fillStyle = col;
            t.fillRect(0, y, w, bh);
        });
        for (let i = 0; i < 24; i++) {
            drawWrappedBlob((i * 29) % w, 20 + ((i * 17) % 88), 18, 2.5, 0, "rgba(255, 248, 220, 0.25)");
        }
        drawWrappedBlob(120, 74, 19, 11, 0, "#991b1b");
        drawWrappedBlob(120, 74, 13, 7, 0, "#dc2626");
        drawWrappedBlob(120, 74, 6, 3, 0, "#fca5a5");
    } else if (name.includes("saturn")) {
        const bands = [
            [0, 16, "#a16207"], [16, 18, "#fde68a"], [34, 16, "#d97706"],
            [50, 24, "#fef3c7"], [74, 18, "#eab308"], [92, 18, "#ca8a04"],
            [110, 18, "#854d0e"]
        ];
        bands.forEach(([y, bh, col]) => {
            t.fillStyle = col;
            t.fillRect(0, y, w, bh);
        });
    } else if (name.includes("mars")) {
        t.fillStyle = "#c2410c";
        t.fillRect(0, 0, w, h);
        drawWrappedBlob(70, 56, 36, 16, -0.2, "#7c2d12");
        drawWrappedBlob(165, 68, 42, 18, 0.15, "#5c1d0c");
        drawWrappedBlob(215, 44, 24, 12, 0.1, "#9a3412");
        drawWrappedBlob(110, 42, 22, 10, 0, "#ea580c");
        t.fillStyle = "#f8fafc";
        t.fillRect(0, 0, w, 9);
        t.fillRect(0, h - 8, w, 8);
    } else if (name.includes("venus")) {
        t.fillStyle = "#d97706";
        t.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) {
            drawWrappedBlob((i * 41) % w, 12 + ((i * 23) % 104), 48, 9, (i % 2 === 0 ? 0.12 : -0.12), "rgba(254, 240, 138, 0.36)");
        }
    } else if (name.includes("uranus")) {
        const g = t.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#a5f3fc");
        g.addColorStop(0.5, "#22d3ee");
        g.addColorStop(1, "#0891b2");
        t.fillStyle = g;
        t.fillRect(0, 0, w, h);
        t.fillStyle = "rgba(255,255,255,0.18)";
        t.fillRect(0, 44, w, 12);
        t.fillRect(0, 74, w, 10);
    } else if (name.includes("neptune")) {
        const g = t.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#1e3a8a");
        g.addColorStop(0.5, "#2563eb");
        g.addColorStop(1, "#1d4ed8");
        t.fillStyle = g;
        t.fillRect(0, 0, w, h);
        drawWrappedBlob(110, 68, 16, 10, 0, "#172554");
        drawWrappedBlob(114, 62, 18, 2.5, -0.1, "rgba(224, 242, 254, 0.75)");
        drawWrappedBlob(195, 42, 24, 2.5, 0.08, "rgba(186, 230, 253, 0.65)");
    } else if (name.includes("europa")) {
        t.fillStyle = "#e0f2fe";
        t.fillRect(0, 0, w, h);
        drawWrappedBlob(90, 52, 45, 22, 0.2, "#bae6fd");
        t.strokeStyle = "rgba(154, 52, 18, 0.55)";
        t.lineWidth = 1.6;
        for (let i = 0; i < 14; i++) {
            const sx = (i * 39) % w;
            [-w, 0, w].forEach(dx => {
                t.beginPath();
                t.moveTo(sx + dx, 8);
                t.lineTo(sx + dx + 55, 120);
                t.stroke();
            });
        }
    } else if (name.includes("titan")) {
        const g = t.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#c2410c");
        g.addColorStop(0.5, "#f97316");
        g.addColorStop(1, "#b45309");
        t.fillStyle = g;
        t.fillRect(0, 0, w, h);
        drawWrappedBlob(80, 24, 34, 10, 0, "rgba(67, 20, 7, 0.45)");
        drawWrappedBlob(180, 64, 52, 12, 0, "rgba(253, 224, 71, 0.22)");
    } else if (name.includes("ceres")) {
        t.fillStyle = "#581c87";
        t.fillRect(0, 0, w, h);
        drawWrappedBlob(100, 64, 65, 36, 0, "#4c1d95");
        for (let i = 0; i < 16; i++) {
            drawWrappedCrater((i * 31) % w, 18 + ((i * 23) % 92), 5 + (i % 5), "#3b0764", "#a855f7");
        }
        drawWrappedBlob(132, 58, 5, 4, 0, "#f8fafc");
    } else {
        const isLuna = name.includes("luna");
        t.fillStyle = isLuna ? "#cbd5e1" : "#94a3b8";
        t.fillRect(0, 0, w, h);
        if (isLuna) {
            drawWrappedBlob(76, 48, 32, 22, 0.2, "#64748b");
            drawWrappedBlob(164, 58, 28, 24, -0.2, "#475569");
        }
        for (let i = 0; i < 22; i++) {
            drawWrappedCrater((i * 27) % w, 14 + ((i * 19) % 100), 4 + (i % 6), "#475569", "#e2e8f0");
        }
    }

    planetTextureCache.set(key, tc);
    return tc;
}

// Renders a 3D Rotating, Illuminated Planet with Rings & Atmosphere
function drawTexturedPlanet(targetCtx, planet, cx, cy, radius, lightAngle, spinAngle) {
    const tex = getPlanetTexture(planet);
    const nameLower = (planet.name || "").toLowerCase();
    const isSaturn = planet.id === "P9" || nameLower.includes("saturn");
    const isUranus = planet.id === "P11" || nameLower.includes("uranus");

    if (isSaturn) {
        drawPlanetaryRingArc(targetCtx, cx, cy, radius, -0.42, Math.PI, Math.PI * 2, true);
    } else if (isUranus) {
        drawPlanetaryRingArc(targetCtx, cx, cy, radius, 1.22, Math.PI, Math.PI * 2, false);
    }

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    targetCtx.clip();

    const diameter = radius * 2;
    const drawW = diameter * (tex.width / tex.height);
    const twoPi = Math.PI * 2;
    const u = (((spinAngle % twoPi) + twoPi) % twoPi) / twoPi;
    const offset = u * drawW;
    const startX = (cx - radius) - offset;

    targetCtx.drawImage(tex, startX, cy - radius, drawW, diameter);
    targetCtx.drawImage(tex, startX + drawW, cy - radius, drawW, diameter);

    if (sphereShadeSprite) {
        targetCtx.save();
        targetCtx.translate(cx, cy);
        targetCtx.rotate(lightAngle);
        targetCtx.drawImage(sphereShadeSprite, -radius, -radius, diameter, diameter);
        targetCtx.restore();
    }
    targetCtx.restore();

    const rimColor = nameLower.includes("earth") ? "rgba(56, 189, 248, 0.7)" :
        nameLower.includes("mars") ? "rgba(251, 146, 60, 0.55)" :
            nameLower.includes("titan") || nameLower.includes("venus") ? "rgba(250, 204, 21, 0.6)" :
                nameLower.includes("neptune") || nameLower.includes("uranus") ? "rgba(34, 211, 238, 0.6)" :
                    "rgba(226, 232, 240, 0.4)";

    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, radius, lightAngle - 1.15, lightAngle + 1.15);
    targetCtx.strokeStyle = rimColor;
    targetCtx.lineWidth = Math.max(1.2, radius * 0.06);
    targetCtx.stroke();
    targetCtx.restore();

    if (isSaturn) {
        drawPlanetaryRingArc(targetCtx, cx, cy, radius, -0.42, 0, Math.PI, true);
    } else if (isUranus) {
        drawPlanetaryRingArc(targetCtx, cx, cy, radius, 1.22, 0, Math.PI, false);
    }
}

function drawPlanetaryRingArc(targetCtx, cx, cy, radius, tilt, startA, endA, isSaturn) {
    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.rotate(tilt);

    if (isSaturn) {
        targetCtx.beginPath();
        targetCtx.ellipse(0, 0, radius * 2.28, radius * 0.68, 0, startA, endA);
        targetCtx.strokeStyle = "rgba(253, 230, 138, 0.68)";
        targetCtx.lineWidth = Math.max(2.0, radius * 0.22);
        targetCtx.stroke();

        targetCtx.beginPath();
        targetCtx.ellipse(0, 0, radius * 1.72, radius * 0.51, 0, startA, endA);
        targetCtx.strokeStyle = "rgba(254, 243, 199, 0.85)";
        targetCtx.lineWidth = Math.max(2.4, radius * 0.28);
        targetCtx.stroke();
    } else {
        targetCtx.beginPath();
        targetCtx.ellipse(0, 0, radius * 1.85, radius * 0.45, 0, startA, endA);
        targetCtx.strokeStyle = "rgba(103, 232, 249, 0.42)";
        targetCtx.lineWidth = Math.max(1.2, radius * 0.1);
        targetCtx.stroke();
    }
    targetCtx.restore();
}

// ============================================================================
// 4. High-FPS 3D Parallax Deep Space Canvas & Offscreen Starfield Layers
// ============================================================================
function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.parentElement.clientWidth || window.innerWidth;
    canvas.height = canvas.parentElement.clientHeight || window.innerHeight;
    initDeepSpaceEnvironment();
}

function initDeepSpaceEnvironment() {
    const w = canvas.width;
    const h = canvas.height;
    const pad = 700;
    const fullW = w + pad * 2;
    const fullH = h + pad * 2;

    // Layer 1: Deep Galaxy & Nebula Layer (Moves slowly at 0.12x pan for 3D depth)
    bgDeepGalaxyCanvas = document.createElement("canvas");
    bgDeepGalaxyCanvas.width = fullW;
    bgDeepGalaxyCanvas.height = fullH;
    const dCtx = bgDeepGalaxyCanvas.getContext("2d", { alpha: false });

    const bg = dCtx.createRadialGradient(fullW * 0.45, fullH * 0.5, 60, fullW * 0.45, fullH * 0.5, Math.max(fullW, fullH) * 0.7);
    bg.addColorStop(0, "#081021");
    bg.addColorStop(0.55, "#030712");
    bg.addColorStop(1, "#010205");
    dCtx.fillStyle = bg;
    dCtx.fillRect(0, 0, fullW, fullH);

    const nebulae = [
        { x: fullW * 0.36, y: fullH * 0.44, r: Math.max(w, h) * 0.52, c1: "rgba(56, 189, 248, 0.09)", c2: "rgba(15, 23, 42, 0)" },
        { x: fullW * 0.64, y: fullH * 0.56, r: Math.max(w, h) * 0.48, c1: "rgba(139, 92, 246, 0.09)", c2: "rgba(15, 23, 42, 0)" },
        { x: fullW * 0.50, y: fullH * 0.32, r: Math.max(w, h) * 0.36, c1: "rgba(16, 185, 129, 0.05)", c2: "rgba(15, 23, 42, 0)" }
    ];
    nebulae.forEach(n => {
        const g = dCtx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.r);
        g.addColorStop(0, n.c1);
        g.addColorStop(1, n.c2);
        dCtx.fillStyle = g;
        dCtx.beginPath();
        dCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        dCtx.fill();
    });

    // Distant faint background stars baked into deep layer
    const deepStarCount = Math.min(900, Math.floor((fullW * fullH) / 4200));
    const palette = ["#ffffff", "#bae6fd", "#fef08a", "#fed7aa", "#c4b5fd"];
    for (let i = 0; i < deepStarCount; i++) {
        dCtx.globalAlpha = Math.random() * 0.45 + 0.15;
        dCtx.fillStyle = palette[i % palette.length];
        const r = Math.random() * 1.0 + 0.3;
        dCtx.beginPath();
        dCtx.arc(Math.random() * fullW, Math.random() * fullH, r, 0, Math.PI * 2);
        dCtx.fill();
    }
    dCtx.globalAlpha = 1.0;

    // Layer 2: Mid-Depth Brighter Starfield (Transparent layer moving at 0.28x pan)
    bgMidStarsCanvas = document.createElement("canvas");
    bgMidStarsCanvas.width = fullW;
    bgMidStarsCanvas.height = fullH;
    const mCtx = bgMidStarsCanvas.getContext("2d");
    const midStarCount = Math.min(550, Math.floor((fullW * fullH) / 6500));
    for (let i = 0; i < midStarCount; i++) {
        mCtx.globalAlpha = Math.random() * 0.65 + 0.3;
        mCtx.fillStyle = palette[(i * 3) % palette.length];
        const r = Math.random() * 1.45 + 0.55;
        mCtx.beginPath();
        mCtx.arc(Math.random() * fullW, Math.random() * fullH, r, 0, Math.PI * 2);
        mCtx.fill();
    }
    mCtx.globalAlpha = 1.0;

    beltAsteroids = [];
    for (let i = 0; i < 140; i++) {
        beltAsteroids.push({
            orbitR: 176 + Math.random() * 44,
            angle: Math.random() * Math.PI * 2,
            speed: 0.045 + Math.random() * 0.02,
            spriteIdx: i % 3
        });
    }
}

function startMainLoop() {
    if (mainLoopStarted) return;
    mainLoopStarted = true;
    lastFrameTime = performance.now();

    function loop(now) {
        const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
        lastFrameTime = now;

        globalTime += dt * 1.05;

        // Well-paced ship journey timing (accounts for flight legs + refuel holds)
        const totalUnits = mapRouteSchedule.length > 0
            ? mapRouteSchedule[mapRouteSchedule.length - 1].endUnit
            : 1;
        const secondsPerUnit = 4.6;
        shipPulseProgress = (shipPulseProgress + (dt / (totalUnits * secondsPerUnit))) % 1.0;

        const clockEl = document.getElementById("simClockBadge");
        if (clockEl) {
            const simDay = Math.floor(globalTime * 12);
            clockEl.innerText = `REAL-TIME: DAY ${String(simDay).padStart(3, "0")} | LIVE ORBITS`;
        }

        if (!cockpitOpen) {
            renderSolarSystem(dt);
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

function renderSolarSystem(dt) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const pad = 700;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw 3D Parallax Deep Galaxy & Starfield Layers (shifts gently when panning/zooming)
    if (bgDeepGalaxyCanvas && bgMidStarsCanvas) {
        const deepScale = 1 + (zoom - 1) * 0.10;
        const deepX = (w * 0.5) - ((w * 0.5 + pad) * deepScale) + panX * 0.12;
        const deepY = (h * 0.5) - ((h * 0.5 + pad) * deepScale) + panY * 0.12;
        ctx.drawImage(
            bgDeepGalaxyCanvas,
            deepX,
            deepY,
            bgDeepGalaxyCanvas.width * deepScale,
            bgDeepGalaxyCanvas.height * deepScale
        );

        const midScale = 1 + (zoom - 1) * 0.22;
        const midX = (w * 0.5) - ((w * 0.5 + pad) * midScale) + panX * 0.28;
        const midY = (h * 0.5) - ((h * 0.5 + pad) * midScale) + panY * 0.28;
        ctx.drawImage(
            bgMidStarsCanvas,
            midX,
            midY,
            bgMidStarsCanvas.width * midScale,
            bgMidStarsCanvas.height * midScale
        );
    } else {
        ctx.fillStyle = "#02040a";
        ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const sunX = w * 0.42;
    const sunY = h * 0.50;

    const planetMap = {};
    currentMappedPlanets = planetsData.map(p => {
        const speed = p.orbitSpeed || 0.05;
        const angle = (p.initialAngle || 0) + (globalTime * speed);
        const r = p.orbitRadius || 100;
        const mapped = {
            ...p,
            canvasX: sunX + Math.cos(angle) * r,
            canvasY: sunY + Math.sin(angle) * r,
            currentAngle: angle
        };
        planetMap[p.id] = mapped;
        return mapped;
    });

    if (showOrbits) drawOrbitalTracks(sunX, sunY, currentMappedPlanets);
    drawMainAsteroidBelt(sunX, sunY, dt);
    drawCentralSun(sunX, sunY);
    drawSpaceCorridors(planetMap);

    if (showMST && mstData && mstData.mstEdges) {
        drawMSTOverlay(planetMap, mstData.mstEdges);
    }

    if (activeRouteData && activeRouteData.path && activeRouteData.path.length > 1) {
        drawActiveMissionPath(planetMap, activeRouteData.path);
    }

    for (let i = 0; i < currentMappedPlanets.length; i++) {
        drawCelestialNode(currentMappedPlanets[i], sunX, sunY);
    }

    ctx.restore();
}

function drawCentralSun(sunX, sunY) {
    if (sunCacheCanvas) {
        ctx.drawImage(sunCacheCanvas, sunX - 80, sunY - 80);
    }
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 10px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SOL (SUN)", sunX, sunY + 36);
}

function drawOrbitalTracks(sunX, sunY, mapped) {
    ctx.save();
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4, 6]);
    for (let i = 0; i < mapped.length; i++) {
        const p = mapped[i];
        ctx.beginPath();
        ctx.arc(sunX, sunY, p.orbitRadius, 0, Math.PI * 2);
        ctx.strokeStyle = p.sector === "INNER" ? "rgba(56, 189, 248, 0.15)" : "rgba(148, 163, 184, 0.11)";
        ctx.stroke();
    }
    ctx.restore();
}

function drawMainAsteroidBelt(sunX, sunY, dt) {
    if (asteroidSprites.length === 0) return;
    for (let i = 0; i < beltAsteroids.length; i++) {
        const ast = beltAsteroids[i];
        ast.angle += ast.speed * dt;
        const ax = sunX + Math.cos(ast.angle) * ast.orbitR - 6;
        const ay = sunY + Math.sin(ast.angle) * ast.orbitR - 6;
        ctx.drawImage(asteroidSprites[ast.spriteIdx], ax, ay);
    }
}

function drawSpaceCorridors(planetMap) {
    currentMappedEdges = [];

    for (let i = 0; i < edgesData.length; i++) {
        const edge = edgesData[i];
        const a = planetMap[edge.sourcePlanetId];
        const b = planetMap[edge.targetPlanetId];
        if (!a || !b) continue;

        currentMappedEdges.push({
            edge,
            x1: a.canvasX, y1: a.canvasY,
            x2: b.canvasX, y2: b.canvasY
        });

        const isHovered = hoveredEdge &&
            hoveredEdge.sourcePlanetId === edge.sourcePlanetId &&
            hoveredEdge.targetPlanetId === edge.targetPlanetId;

        ctx.beginPath();
        ctx.moveTo(a.canvasX, a.canvasY);
        ctx.lineTo(b.canvasX, b.canvasY);

        if (edge.disrupted) {
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = (isHovered ? 3.2 : 2.0) / zoom;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            const mx = (a.canvasX + b.canvasX) * 0.5;
            const my = (a.canvasY + b.canvasY) * 0.5;
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(mx, my, 7 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.max(8, 10 / zoom)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("!", mx, my + 3.5 / zoom);
        } else {
            ctx.strokeStyle = isHovered ? "rgba(56, 189, 248, 0.78)" : "rgba(56, 189, 248, 0.16)";
            ctx.lineWidth = (isHovered ? 2.4 : 1.0) / zoom;
            ctx.stroke();
        }
    }
}

function drawMSTOverlay(planetMap, mstEdges) {
    ctx.save();
    ctx.strokeStyle = "rgba(56, 239, 125, 0.25)";
    ctx.lineWidth = 6 / zoom;
    ctx.beginPath();
    mstEdges.forEach(link => {
        const a = planetMap[link.sourceId];
        const b = planetMap[link.targetId];
        if (a && b) {
            ctx.moveTo(a.canvasX, a.canvasY);
            ctx.lineTo(b.canvasX, b.canvasY);
        }
    });
    ctx.stroke();

    ctx.strokeStyle = "#38ef7d";
    ctx.lineWidth = 2.2 / zoom;
    ctx.stroke();
    ctx.restore();
}

// ============================================================================
// Straight Graph-Edge Path Trajectory & Refueling Hold Schedule
// ============================================================================
function buildMapRouteSchedule(path, refuelStops) {
    const refuelSet = new Set(refuelStops || []);
    const schedule = [];
    let cursor = 0;

    for (let i = 0; i < path.length - 1; i++) {
        // 1. Direct Graph Corridor Flight Leg
        schedule.push({
            type: "FLIGHT",
            legIdx: i,
            fromId: path[i].id,
            toId: path[i + 1].id,
            startUnit: cursor,
            endUnit: cursor + 1.0
        });
        cursor += 1.0;

        // 2. Stationary Orbital Refueling Hold at intermediate depot stops
        const destNode = path[i + 1];
        if (i < path.length - 2 && refuelSet.has(destNode.name)) {
            schedule.push({
                type: "REFUEL",
                planetId: destNode.id,
                planetName: destNode.name,
                startUnit: cursor,
                endUnit: cursor + 0.52
            });
            cursor += 0.52;
        }
    }
    return schedule;
}

function drawActiveMissionPath(planetMap, path) {
    const coords = [];
    for (let i = 0; i < path.length; i++) {
        const pt = planetMap[path[i].id];
        if (pt) coords.push(pt);
    }
    if (coords.length < 2) return;

    ctx.save();

    // Build straight node-to-node graph path matching the network corridors
    ctx.beginPath();
    for (let i = 0; i < coords.length; i++) {
        const pt = coords[i];
        if (i === 0) ctx.moveTo(pt.canvasX, pt.canvasY);
        else ctx.lineTo(pt.canvasX, pt.canvasY);
    }

    // Outer luminous corridor aura
    ctx.strokeStyle = "rgba(0, 240, 255, 0.22)";
    ctx.lineWidth = 8 / zoom;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Crisp inner trajectory line
    ctx.strokeStyle = "#e0f2fe";
    ctx.lineWidth = 2.4 / zoom;
    ctx.stroke();

    // Animated energy flow overlay along the straight corridor path
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2.6 / zoom;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -globalTime * 28;
    ctx.stroke();
    ctx.setLineDash([]);

    // Determine active schedule segment (Flight vs Refueling Hold)
    if (mapRouteSchedule.length === 0) {
        mapRouteSchedule = buildMapRouteSchedule(path, activeRouteData.refuelStops || []);
    }

    const totalUnits = mapRouteSchedule[mapRouteSchedule.length - 1].endUnit;
    const currentUnit = shipPulseProgress * totalUnits;
    let activeItem = mapRouteSchedule[mapRouteSchedule.length - 1];
    for (let i = 0; i < mapRouteSchedule.length; i++) {
        if (currentUnit <= mapRouteSchedule[i].endUnit) {
            activeItem = mapRouteSchedule[i];
            break;
        }
    }

    const itemSpan = Math.max(0.0001, activeItem.endUnit - activeItem.startUnit);
    const localT = Math.max(0, Math.min(1, (currentUnit - activeItem.startUnit) / itemSpan));

    if (activeItem.type === "REFUEL") {
        // Spacecraft holds position in tight orbital formation beside the refueling station
        const station = planetMap[activeItem.planetId] || coords[0];
        const orbitAngle = station.currentAngle + Math.PI * 0.35;
        const holdDist = 24;
        const shipX = station.canvasX + Math.cos(orbitAngle) * holdDist;
        const shipY = station.canvasY + Math.sin(orbitAngle) * holdDist;
        const tangentHeading = orbitAngle + Math.PI * 0.5;

        // Pulsing green cryogenic propellant transfer tether
        ctx.save();
        ctx.strokeStyle = "rgba(56, 239, 125, 0.85)";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -globalTime * 24;
        ctx.beginPath();
        ctx.moveTo(station.canvasX, station.canvasY);
        ctx.lineTo(shipX, shipY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Expanding orbital refueling ring
        const ringR = 16 + ((globalTime * 18) % 14);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.65)";
        ctx.lineWidth = 1.4 / zoom;
        ctx.beginPath();
        ctx.arc(station.canvasX, station.canvasY, ringR, 0, Math.PI * 2);
        ctx.stroke();

        // Refueling status label
        ctx.fillStyle = "#facc15";
        ctx.font = `bold ${Math.max(9, 10 / zoom)}px 'Orbitron', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`REFUELING (${Math.round(localT * 100)}%)`, station.canvasX, station.canvasY - 26);
        ctx.restore();

        draw3DSpacecraft(shipX, shipY, tangentHeading, true);
    } else {
        // Spacecraft cruising straight along the active graph edge
        const pStart = coords[activeItem.legIdx];
        const pEnd = coords[activeItem.legIdx + 1];
        const posX = pStart.canvasX + (pEnd.canvasX - pStart.canvasX) * localT;
        const posY = pStart.canvasY + (pEnd.canvasY - pStart.canvasY) * localT;
        const heading = Math.atan2(pEnd.canvasY - pStart.canvasY, pEnd.canvasX - pStart.canvasX);

        draw3DSpacecraft(posX, posY, heading, false);
    }

    ctx.restore();
}

function draw3DSpacecraft(x, y, heading, isDockedRefueling = false) {
    if (!shipSpriteCanvas) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);

    const shipScale = Math.max(0.48, 0.72 / Math.sqrt(zoom));
    ctx.scale(shipScale, shipScale);

    // Subtle idle thruster glow when stopped for refueling, full torch plume in cruise
    const flicker = isDockedRefueling
        ? 4 + Math.sin(globalTime * 14) * 1.5
        : 16 + Math.sin(globalTime * 36) * 5 + Math.cos(globalTime * 52) * 3;

    [-7, 7].forEach(py => {
        const plume = ctx.createLinearGradient(-25, py, -25 - flicker, py);
        plume.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        plume.addColorStop(0.3, isDockedRefueling ? "rgba(250, 204, 21, 0.75)" : "rgba(0, 240, 255, 0.85)");
        plume.addColorStop(0.7, "rgba(56, 239, 125, 0.45)");
        plume.addColorStop(1, "rgba(56, 239, 125, 0)");

        ctx.fillStyle = plume;
        ctx.beginPath();
        ctx.moveTo(-25, py - 2.5);
        ctx.lineTo(-25 - flicker, py);
        ctx.lineTo(-25, py + 2.5);
        ctx.closePath();
        ctx.fill();
    });

    ctx.drawImage(shipSpriteCanvas, -55, -55);
    ctx.restore();
}

function drawCelestialNode(node, sunX, sunY) {
    const x = node.canvasX;
    const y = node.canvasY;
    const nameLower = (node.name || "").toLowerCase();
    const isHovered = hoveredPlanet && hoveredPlanet.id === node.id;

    const lightAngle = Math.atan2(sunY - y, sunX - x);
    const radius = (nameLower.includes("jupiter") || nameLower.includes("saturn")) ? 16 :
        (nameLower.includes("uranus") || nameLower.includes("neptune")) ? 13.5 :
            (nameLower.includes("luna") || nameLower.includes("europa") || nameLower.includes("titan") || nameLower.includes("ceres")) ? 9.5 : 12.5;

    const spinSpeed = (node.orbitSpeed || 0.05) * 14 + 0.45;
    const spinAngle = (node.initialAngle || 0) + globalTime * spinSpeed;

    drawTexturedPlanet(ctx, node, x, y, radius, lightAngle, spinAngle);

    if (isHovered) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.restore();
    }

    if (node.hasRefuelDepot) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(56, 239, 125, 0.72)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(node.id, x, y - radius - 8);

    ctx.fillStyle = isHovered ? "#38bdf8" : "#cbd5e1";
    ctx.font = "600 11px 'Rajdhani', sans-serif";
    ctx.fillText(node.name, x, y + radius + 14);
}

// ============================================================================
// 5. Robust Scaled Mouse Interactions & Hit Detection
// ============================================================================
function getCanvasMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function setupCanvasInteractions() {
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = 1.12;
        const pos = getCanvasMousePos(e);
        const mx = pos.x;
        const my = pos.y;

        const nextZoom = e.deltaY < 0 ? Math.min(zoom * factor, maxZoom) : Math.max(zoom / factor, minZoom);
        panX = mx - (mx - panX) * (nextZoom / zoom);
        panY = my - (my - panY) * (nextZoom / zoom);
        zoom = nextZoom;
    }, { passive: false });

    canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0) {
            isDragging = true;
            dragMoved = false;
            canvas.style.cursor = "grabbing";
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (isDragging) {
            if (Math.hypot(e.movementX, e.movementY) > 0.5) {
                dragMoved = true;
            }
            panX += e.movementX;
            panY += e.movementY;
            return;
        }

        const pos = getCanvasMousePos(e);
        const wx = (pos.x - panX) / zoom;
        const wy = (pos.y - panY) / zoom;

        hoveredPlanet = null;
        for (let i = 0; i < currentMappedPlanets.length; i++) {
            const p = currentMappedPlanets[i];
            if (Math.hypot(wx - p.canvasX, wy - p.canvasY) <= 24) {
                hoveredPlanet = p;
                break;
            }
        }

        hoveredEdge = null;
        if (!hoveredPlanet) {
            for (let i = 0; i < currentMappedEdges.length; i++) {
                const item = currentMappedEdges[i];
                if (pointToSegmentDistance(wx, wy, item.x1, item.y1, item.x2, item.y2) <= 8 / zoom) {
                    hoveredEdge = item.edge;
                    break;
                }
            }
        }

        canvas.style.cursor = (hoveredPlanet || hoveredEdge) ? "pointer" : "grab";
    });

    window.addEventListener("mouseup", () => {
        isDragging = false;
        canvas.style.cursor = (hoveredPlanet || hoveredEdge) ? "pointer" : "grab";
    });

    canvas.addEventListener("click", (e) => {
        if (dragMoved) return;
        const pos = getCanvasMousePos(e);
        const wx = (pos.x - panX) / zoom;
        const wy = (pos.y - panY) / zoom;

        let clickedPlanet = null;
        for (let i = 0; i < currentMappedPlanets.length; i++) {
            const p = currentMappedPlanets[i];
            if (Math.hypot(wx - p.canvasX, wy - p.canvasY) <= 26) {
                clickedPlanet = p;
                break;
            }
        }

        let clickedEdge = null;
        if (!clickedPlanet) {
            for (let i = 0; i < currentMappedEdges.length; i++) {
                const item = currentMappedEdges[i];
                if (pointToSegmentDistance(wx, wy, item.x1, item.y1, item.x2, item.y2) <= 10 / zoom) {
                    clickedEdge = item.edge;
                    break;
                }
            }
        }

        if (clickedPlanet) {
            openPlanetaryCommandDeck(clickedPlanet);
        } else if (clickedEdge) {
            triggerWeatherOnCorridor(clickedEdge.sourcePlanetId, clickedEdge.targetPlanetId, "Class-X Solar Flare");
        }
    });
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ============================================================================
// 6. Backend API Actions & UI Handlers
// ============================================================================
function showCockpitLaunchButtons() {
    document.getElementById("btnOpenCockpit")?.classList.remove("hidden");
    document.getElementById("btnOpenCockpitTour")?.classList.remove("hidden");
    document.getElementById("btnHudCockpit")?.classList.remove("hidden");
}

async function computeOptimalRoute() {
    const start = document.getElementById("startPlanet").value;
    const dest = document.getElementById("destPlanet").value;
    const mode = document.getElementById("routeMode").value;
    const fuelInput = parseFloat(document.getElementById("fuelTankInput").value);
    if (!isNaN(fuelInput) && fuelInput > 0) {
        maxFuelTons = fuelInput;
        updateShipHUD();
    }

    if (!start || !dest) {
        showNotification("Select both an Origin and Destination station.", "error");
        return;
    }
    if (start === dest) {
        showNotification("Origin and Destination must be different stations.", "error");
        return;
    }

    try {
        const url = `${API_BASE_URL}/route?start=${start}&destination=${dest}&mode=${mode}&maxFuelTons=${maxFuelTons}&shieldBonus=${shieldBonus}&simTime=${globalTime.toFixed(2)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            showNotification(data.error, "error");
            return;
        }

        activeRouteData = data;
        mapRouteSchedule = buildMapRouteSchedule(data.path, data.refuelStops || []);
        shipPulseProgress = 0;
        renderMissionTelemetry(data);
        showCockpitLaunchButtons();
        refreshLeaderboard();
        showNotification(`Mission ${data.missionId} computed (${data.travelDuration}, $${data.calculatedCost.toLocaleString()}).`, "info");
    } catch (err) {
        console.error(err);
        showNotification("Route calculation failed. Check Spring Boot server.", "error");
    }
}

async function computeMultiStopTour() {
    const checked = Array.from(document.querySelectorAll("#waypointCheckboxes input:checked")).map(cb => cb.value);
    if (checked.length < 2) {
        showNotification("Select at least 2 colonies for a multi-stop tour.", "error");
        return;
    }

    const mode = document.getElementById("routeMode").value;
    try {
        const url = `${API_BASE_URL}/tour?waypoints=${checked.join(",")}&mode=${mode}&maxFuelTons=${maxFuelTons}&shieldBonus=${shieldBonus}&simTime=${globalTime.toFixed(2)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            showNotification(data.error, "error");
            return;
        }

        activeRouteData = data;
        mapRouteSchedule = buildMapRouteSchedule(data.path, data.refuelStops || []);
        shipPulseProgress = 0;
        renderMissionTelemetry(data);
        showCockpitLaunchButtons();
        showNotification(`Multi-stop tour optimized across ${checked.length} colonies!`, "info");
    } catch (err) {
        console.error(err);
        showNotification("Multi-stop tour computation failed.", "error");
    }
}

async function toggleRelayMST() {
    showMST = !showMST;
    const btn = document.getElementById("btnToggleMST");
    if (btn) {
        btn.classList.toggle("active", showMST);
        btn.innerText = showMST ? "RELAY MST: ON" : "RELAY MST: OFF";
    }

    if (showMST) {
        try {
            const res = await fetch(`${API_BASE_URL}/mst?simTime=${globalTime.toFixed(2)}`);
            mstData = await res.json();
            showNotification(`Kruskal's MST Active: ${mstData.totalLinks} backbone links (${mstData.totalBackboneDistanceMkm} Mkm).`, "info");
        } catch (err) {
            console.error(err);
        }
    }
}

async function triggerWeatherOnCorridor(sourceId, targetId, hazardType) {
    try {
        const res = await fetch(`${API_BASE_URL}/hazard/trigger?source=${sourceId}&target=${targetId}&type=${encodeURIComponent(hazardType)}`, {
            method: "POST"
        });
        const data = await res.json();
        if (data.success) {
            edgesData = data.edges;
            populateEdgeSelector(edgesData);
            document.getElementById("undoCount").innerText = data.undoStackSize;
            showNotification(`ALERT: ${hazardType} struck corridor ${sourceId} ↔ ${targetId}! Re-routing...`, "error");

            if (activeRouteData && activeRouteData.path && activeRouteData.path.length >= 2) {
                computeOptimalRoute();
            }
        }
    } catch (err) {
        console.error(err);
    }
}

async function undoLastWeatherEvent() {
    try {
        const res = await fetch(`${API_BASE_URL}/hazard/undo`, { method: "POST" });
        const data = await res.json();
        document.getElementById("undoCount").innerText = data.undoStackSize || 0;

        if (!data.success) {
            showNotification(data.message || "Nothing to undo on stack.", "info");
            return;
        }

        edgesData = data.edges;
        populateEdgeSelector(edgesData);
        showNotification(`LIFO Undo: Cleared ${data.revertedHazard} on ${data.corridor}.`, "info");

        if (activeRouteData && activeRouteData.path && activeRouteData.path.length >= 2) {
            computeOptimalRoute();
        }
    } catch (err) {
        console.error(err);
    }
}

async function refreshLeaderboard() {
    try {
        const res = await fetch(`${API_BASE_URL}/leaderboard`);
        const records = await res.json();
        const container = document.getElementById("leaderboardList");
        if (!container) return;

        if (!records || records.length === 0) {
            container.innerHTML = '<p class="empty-msg">No missions logged yet. Compute a route to record telemetry.</p>';
            return;
        }

        container.innerHTML = records.map((rec, idx) => `
            <div class="bst-card">
                <div>
                    <div class="bst-route">#${idx + 1} ${rec.originName.split(" ")[0]} &rarr; ${rec.destinationName.split(" ")[0]}</div>
                    <div class="bst-meta">${rec.missionId} &bull; ${rec.mode} &bull; ${rec.totalDistanceMkm} Mkm &bull; ${rec.totalFuelTons} t</div>
                </div>
                <div class="bst-cost">$${rec.totalCostUsd.toLocaleString()}</div>
            </div>
        `).join("");
    } catch (err) {
        console.error(err);
    }
}

function renderMissionTelemetry(data) {
    document.getElementById("metricDistance").innerText = `${data.totalDistance} Mkm`;
    document.getElementById("metricDuration").innerText = data.travelDuration || "--";
    document.getElementById("metricFuel").innerText = `${data.totalFuelTons} t`;
    document.getElementById("metricHazard").innerText = `${data.totalHazard} mSv`;
    document.getElementById("metricLatency").innerText = `${data.signalLatencyMin} min`;
    document.getElementById("metricCost").innerText = `$${data.calculatedCost.toLocaleString()}`;

    const itinerary = document.getElementById("itineraryList");
    if (!itinerary) return;

    const refuelSet = new Set(data.refuelStops || []);
    let html = '<div style="display:flex; flex-direction:column; gap:7px;">';

    data.path.forEach((step, idx) => {
        const isStart = idx === 0;
        const isEnd = idx === data.path.length - 1;
        const didRefuel = refuelSet.has(step.name);
        const accent = isStart ? "#22c55e" : (isEnd ? "#ef4444" : (didRefuel ? "#facc15" : "#38bdf8"));
        const tag = isStart ? "LAUNCH ORIGIN" : (isEnd ? "FINAL DESTINATION" : (didRefuel ? "REFUELING DEPOT STOP" : `WAYPOINT ${idx}`));

        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 10px; background:rgba(15,23,42,0.85); border-left:3px solid ${accent}; border-radius:4px;">
                <div>
                    <span style="font-size:10px; font-weight:700; color:${accent}; display:block;">${tag}</span>
                    <span style="font-size:13px; font-weight:600; color:#f8fafc;">${step.name}</span>
                </div>
                <span style="font-size:11px; color:#94a3b8; font-family:monospace;">${step.id}</span>
            </div>
        `;
    });

    if (data.solarConjunctionCount && data.solarConjunctionCount > 0) {
        html += `
            <div style="margin-top:6px; padding:8px; background:rgba(234,179,8,0.12); border:1px solid #eab308; border-radius:5px; font-size:11px; color:#fde047;">
                SOLAR CONJUNCTION ADVISORY: ${data.solarConjunctionCount} leg(s) passed near Sol's corona, increasing radio noise.
            </div>
        `;
    }

    html += "</div>";
    itinerary.innerHTML = html;
}

// ============================================================================
// 7. Planetary Command Deck with Live 3D Textured Globe & Depth-Sorted Probe
// ============================================================================
function openPlanetaryCommandDeck(planet) {
    selectedDeckPlanet = planet;
    const deck = document.getElementById("planetCommandDeck");
    if (!deck) return;

    document.getElementById("deckSectorBadge").innerText = `${planet.sector || "SOLAR"} SECTOR`;
    document.getElementById("deckPlanetName").innerText = planet.name.toUpperCase();
    document.getElementById("deckPlanetId").innerText = planet.id;
    document.getElementById("deckPlanetDesc").innerText = planet.description || "Deep-space orbital installation.";
    document.getElementById("deckOrbitDist").innerText = `${planet.xCoordinate} Mkm`;
    document.getElementById("deckAtmo").innerText = planet.atmosphere || "Vacuum";
    document.getElementById("deckRefuelPrice").innerText = planet.hasRefuelDepot ? `$${planet.refuelCostPerTon} / ton` : "No Depot";

    const refuelTag = document.getElementById("deckRefuelTag");
    if (refuelTag) {
        refuelTag.innerText = planet.hasRefuelDepot ? "PROPELLANT DEPOT ONLINE" : "RELAY / OBSERVATION ONLY";
        refuelTag.style.borderColor = planet.hasRefuelDepot ? "#38ef7d" : "#94a3b8";
        refuelTag.style.color = planet.hasRefuelDepot ? "#38ef7d" : "#94a3b8";
    }

    const connected = edgesData.filter(e => e.sourcePlanetId === planet.id || e.targetPlanetId === planet.id);
    document.getElementById("deckLaneCount").innerText = `${connected.length} Corridors`;

    const corridorsDiv = document.getElementById("deckCorridorsList");
    corridorsDiv.innerHTML = connected.map(e => {
        const peerId = e.sourcePlanetId === planet.id ? e.targetPlanetId : e.sourcePlanetId;
        const peer = planetsData.find(p => p.id === peerId);
        return `
            <div class="corridor-pill ${e.disrupted ? "disrupted" : ""}">
                <strong>${peer ? peer.name : peerId}</strong> &bull; ${e.baseDistanceMkm} Mkm &bull; ${e.radiationHazardMsv} mSv
                ${e.disrupted ? ` (${e.disruptionReason})` : ""}
            </div>
        `;
    }).join("");

    const suppliesDiv = document.getElementById("deckSuppliesContainer");
    suppliesDiv.innerHTML = shipSuppliesCatalog.map(item => {
        const isEquipped = equippedUpgrades.has(item.id);
        return `
            <div class="supply-upgrade-card">
                <div>
                    <div class="sup-title">${item.name}</div>
                    <div class="sup-effect">${item.effect}</div>
                </div>
                <div class="sup-footer">
                    <span class="sup-price">$${item.price.toLocaleString()}</span>
                    <button class="btn-equip" data-sup-id="${item.id}">
                        ${isEquipped ? "EQUIPPED" : "EQUIP UPGRADE"}
                    </button>
                </div>
            </div>
        `;
    }).join("");

    suppliesDiv.querySelectorAll(".btn-equip").forEach(btn => {
        btn.addEventListener("click", () => {
            const sup = shipSuppliesCatalog.find(s => s.id === btn.dataset.supId);
            if (sup) {
                equippedUpgrades.add(sup.id);
                sup.apply();
                btn.innerText = "EQUIPPED";
                showNotification(`Equipped ${sup.name} ($${sup.price.toLocaleString()})!`, "info");
            }
        });
    });

    deck.classList.remove("hidden");
    startDeckPlanetAnimation(planet);
}

function closePlanetaryCommandDeck() {
    const deck = document.getElementById("planetCommandDeck");
    if (deck) deck.classList.add("hidden");
    if (deckAnimId) {
        cancelAnimationFrame(deckAnimId);
        deckAnimId = null;
    }
}

function startDeckPlanetAnimation(planet) {
    const pCanvas = document.getElementById("planetDetailCanvas");
    if (!pCanvas) return;
    const pCtx = pCanvas.getContext("2d");
    let orbitAngle = 0;
    let spinAngle = 0;

    function animatePlanet() {
        orbitAngle += 0.022;
        spinAngle += 0.014;

        const w = pCanvas.width;
        const h = pCanvas.height;
        pCtx.clearRect(0, 0, w, h);

        pCtx.strokeStyle = "rgba(56, 189, 248, 0.09)";
        pCtx.lineWidth = 1;
        for (let x = 0; x < w; x += 28) {
            pCtx.beginPath();
            pCtx.moveTo(x, 0);
            pCtx.lineTo(x, h);
            pCtx.stroke();
        }
        for (let y = 0; y < h; y += 28) {
            pCtx.beginPath();
            pCtx.moveTo(0, y);
            pCtx.lineTo(w, y);
            pCtx.stroke();
        }

        const cx = w / 2;
        const cy = h / 2;
        const r = 68;
        const satX = cx + Math.cos(orbitAngle) * 116;
        const satY = cy + Math.sin(orbitAngle) * 36;
        const satBehind = Math.sin(orbitAngle) < 0;

        pCtx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        pCtx.lineWidth = 1.2;
        pCtx.beginPath();
        pCtx.ellipse(cx, cy, 116, 36, 0, Math.PI, Math.PI * 2);
        pCtx.stroke();

        if (satBehind) {
            drawDeckSatellite(pCtx, satX, satY, 0.8);
        }

        drawTexturedPlanet(pCtx, planet, cx, cy, r, -0.45, spinAngle);

        pCtx.strokeStyle = "rgba(56, 189, 248, 0.45)";
        pCtx.lineWidth = 1.2;
        pCtx.beginPath();
        pCtx.ellipse(cx, cy, 116, 36, 0, 0, Math.PI);
        pCtx.stroke();

        if (!satBehind) {
            drawDeckSatellite(pCtx, satX, satY, 1.05);
        }

        deckAnimId = requestAnimationFrame(animatePlanet);
    }

    if (deckAnimId) cancelAnimationFrame(deckAnimId);
    animatePlanet();
}

function drawDeckSatellite(pCtx, sx, sy, scale) {
    pCtx.save();
    pCtx.translate(sx, sy);
    pCtx.scale(scale, scale);

    pCtx.fillStyle = "#0284c7";
    pCtx.fillRect(-11, -2, 8, 4);
    pCtx.fillRect(3, -2, 8, 4);

    pCtx.fillStyle = "#f8fafc";
    pCtx.fillRect(-3, -3, 6, 6);

    pCtx.fillStyle = "#38ef7d";
    pCtx.beginPath();
    pCtx.arc(0, 0, 2, 0, Math.PI * 2);
    pCtx.fill();

    pCtx.restore();
}

// ============================================================================
// 8. First-Person Starship Cockpit Journey View
// ============================================================================
function openCockpitJourneyView() {
    if (!activeRouteData || !activeRouteData.path || activeRouteData.path.length < 2) {
        showNotification("Compute an optimal route first to launch Cockpit View.", "error");
        return;
    }

    const win = document.getElementById("cockpitJourneyWindow");
    cockpitCanvas = document.getElementById("cockpitCanvas");
    if (!win || !cockpitCanvas) return;

    cockpitCtx = cockpitCanvas.getContext("2d", { alpha: false });
    buildCockpitJourneyLegs();
    initCockpit3DParticles();

    cockpitOpen = true;
    cockpitPlaying = true;
    cockpitProgress = 0;
    cockpitLookX = 0;
    cockpitLookY = 0;
    cockpitTargetLookX = 0;
    cockpitTargetLookY = 0;

    const playBtn = document.getElementById("btnCockpitPlayPause");
    if (playBtn) playBtn.innerText = "PAUSE";

    const missionBadge = document.getElementById("cockpitMissionBadge");
    if (missionBadge) {
        const mId = activeRouteData.missionId || "TOUR";
        const mode = activeRouteData.routeType || "BALANCED";
        missionBadge.innerText = `${mId} // ${mode}`;
    }

    renderCockpitLegChecklist();
    renderScrubberMarkers();

    win.classList.remove("hidden");
    resizeCockpitCanvas();

    cockpitLastTime = performance.now();
    if (cockpitAnimId) cancelAnimationFrame(cockpitAnimId);
    cockpitLoop(cockpitLastTime);
}

function closeCockpitJourneyView() {
    cockpitOpen = false;
    const win = document.getElementById("cockpitJourneyWindow");
    if (win) win.classList.add("hidden");
    if (cockpitAnimId) {
        cancelAnimationFrame(cockpitAnimId);
        cockpitAnimId = null;
    }
}

function resizeCockpitCanvas() {
    if (!cockpitCanvas) return;
    cockpitCanvas.width = window.innerWidth;
    cockpitCanvas.height = window.innerHeight;
}

function buildCockpitJourneyLegs() {
    const path = activeRouteData.path;
    const refuelSet = new Set(activeRouteData.refuelStops || []);
    const rawEdges = [];
    let rawDistSum = 0;
    let rawFuelSum = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const u = path[i];
        const v = path[i + 1];
        const edge = edgesData.find(e =>
            (e.sourcePlanetId === u.id && e.targetPlanetId === v.id) ||
            (e.sourcePlanetId === v.id && e.targetPlanetId === u.id)
        );
        const baseDist = edge ? edge.baseDistanceMkm : 100;
        const baseFuel = edge ? edge.baseFuelTons : 80;
        rawDistSum += baseDist;
        rawFuelSum += baseFuel;
        rawEdges.push({ u, v, edge, baseDist, baseFuel });
    }

    const totalDist = activeRouteData.totalDistance || rawDistSum;
    const totalFuel = activeRouteData.totalFuelTons || rawFuelSum;

    // Weight legs with extra time share when an orbital refueling stop occurs
    const weights = rawEdges.map((item, idx) => {
        const willRefuel = refuelSet.has(item.v.name) && idx < rawEdges.length - 1;
        return 1.0 + (willRefuel ? 0.45 : 0.0);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let cumStart = 0;

    cockpitLegs = rawEdges.map((item, idx) => {
        const distMkm = Math.round((item.baseDist / (rawDistSum || 1)) * totalDist * 10) / 10;
        const fuelTons = Math.round((item.baseFuel / (rawFuelSum || 1)) * totalFuel * 10) / 10;
        const share = weights[idx] / totalWeight;
        const startNorm = cumStart;
        const endNorm = idx === rawEdges.length - 1 ? 1.0 : Math.min(1.0, cumStart + share);
        cumStart = endNorm;

        const baseHazard = item.edge ? item.edge.radiationHazardMsv : 15;
        const disrupted = item.edge ? item.edge.disrupted : false;
        const disruptionReason = item.edge ? item.edge.disruptionReason : "Nominal";
        const interference = item.edge ? item.edge.signalInterference : 0.1;
        const radMsv = Math.round((baseHazard * (1 - shieldBonus) + (disrupted ? 85 : 0)) * 10) / 10;
        const willRefuel = refuelSet.has(item.v.name) && idx < rawEdges.length - 1;
        const hasAsteroids = item.u.id === "P6" || item.v.id === "P6" || item.u.sector !== item.v.sector;

        return {
            index: idx,
            from: item.u,
            to: item.v,
            distMkm,
            fuelTons,
            radMsv,
            interference: Math.min(0.99, interference + (disrupted ? 0.5 : 0)),
            disrupted,
            disruptionReason,
            willRefuel,
            hasAsteroids,
            startNorm,
            endNorm
        };
    });
}

function initCockpit3DParticles() {
    cockpitStars = [];
    const palette = ["#ffffff", "#bae6fd", "#fef08a", "#fed7aa", "#c4b5fd"];
    for (let i = 0; i < 360; i++) {
        cockpitStars.push({
            x: (Math.random() - 0.5) * 2600,
            y: (Math.random() - 0.5) * 1800,
            z: Math.random() * 1100 + 20,
            color: palette[i % palette.length],
            size: Math.random() * 1.6 + 0.6
        });
    }

    cockpitAsteroids = [];
    for (let i = 0; i < 28; i++) {
        cockpitAsteroids.push({
            x: (Math.random() - 0.5) * 1900,
            y: (Math.random() - 0.5) * 1200,
            z: Math.random() * 1100 + 60,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 2.5,
            scale: 0.7 + Math.random() * 1.4
        });
    }
}

function renderCockpitLegChecklist() {
    const listEl = document.getElementById("cockpitLegList");
    if (!listEl) return;

    listEl.innerHTML = cockpitLegs.map((leg, idx) => `
        <div class="c-leg-item" data-leg-idx="${idx}">
            <div class="c-leg-route">
                ${idx + 1}. ${leg.from.name.split(" ")[0]} &rarr; ${leg.to.name.split(" ")[0]}
                ${leg.willRefuel ? ' <span style="color:#facc15;">[REFUEL]</span>' : ""}
                ${leg.disrupted ? ' <span style="color:#ef4444;">[STORM]</span>' : ""}
            </div>
            <div class="c-leg-meta">${leg.distMkm} Mkm &bull; ${leg.fuelTons} t &bull; ${leg.radMsv} mSv</div>
        </div>
    `).join("");

    listEl.querySelectorAll(".c-leg-item").forEach(item => {
        item.addEventListener("click", () => {
            const idx = parseInt(item.dataset.legIdx, 10);
            if (!isNaN(idx) && cockpitLegs[idx]) {
                cockpitProgress = cockpitLegs[idx].startNorm + 0.001;
                cockpitPlaying = true;
                const playBtn = document.getElementById("btnCockpitPlayPause");
                if (playBtn) playBtn.innerText = "PAUSE";
            }
        });
    });
}

function renderScrubberMarkers() {
    const container = document.getElementById("cockpitMarkers");
    if (!container) return;

    container.innerHTML = cockpitLegs.map(leg => {
        const pct = (leg.endNorm * 100).toFixed(1);
        return `<span class="scrub-dot ${leg.willRefuel ? "refuel" : ""}" style="left:${pct}%;" title="${leg.to.name}"></span>`;
    }).join("");
}

function cockpitLoop(now) {
    if (!cockpitOpen) return;
    const dt = Math.min(0.05, (now - cockpitLastTime) / 1000);
    cockpitLastTime = now;

    // Responsive, lively pilot head-look parallax
    cockpitLookX += (cockpitTargetLookX - cockpitLookX) * 0.14;
    cockpitLookY += (cockpitTargetLookY - cockpitLookY) * 0.14;

    // Calmer mission flight progression (~9.5 seconds per leg at 1x, ~19s at 0.5x)
    if (cockpitPlaying && cockpitProgress < 1.0) {
        const legCount = Math.max(1, cockpitLegs.length);
        const baseRate = 1.0 / (legCount * 9.5);
        cockpitProgress = Math.min(1.0, cockpitProgress + dt * baseRate * cockpitSpeedMult);
        if (cockpitProgress >= 1.0) {
            cockpitPlaying = false;
            const playBtn = document.getElementById("btnCockpitPlayPause");
            if (playBtn) playBtn.innerText = "REPLAY";
        }
    }

    const scrubber = document.getElementById("cockpitScrubber");
    if (scrubber) {
        scrubber.value = Math.round(cockpitProgress * 1000);
    }

    // Determine active leg & local leg progress [0..1]
    let activeLeg = cockpitLegs[cockpitLegs.length - 1];
    for (let i = 0; i < cockpitLegs.length; i++) {
        if (cockpitProgress <= cockpitLegs[i].endNorm || i === cockpitLegs.length - 1) {
            activeLeg = cockpitLegs[i];
            break;
        }
    }
    const legSpan = Math.max(0.0001, activeLeg.endNorm - activeLeg.startNorm);
    const localT = Math.max(0, Math.min(1, (cockpitProgress - activeLeg.startNorm) / legSpan));

    // When leg includes a scheduled refuel stop, flight takes 0..0.72 and stationary refueling hold takes 0.72..1.0
    const refuelThreshold = 0.72;
    const isRefuelingPhase = activeLeg.willRefuel && localT >= refuelThreshold && cockpitProgress < 0.999;
    const flightT = activeLeg.willRefuel
        ? Math.min(1.0, localT / refuelThreshold)
        : localT;
    const refuelT = isRefuelingPhase
        ? Math.min(1.0, (localT - refuelThreshold) / (1.0 - refuelThreshold))
        : 0;

    renderCockpitScene(dt, activeLeg, flightT, isRefuelingPhase, refuelT);
    updateCockpitTelemetryHUD(activeLeg, flightT, isRefuelingPhase, refuelT);

    cockpitAnimId = requestAnimationFrame(cockpitLoop);
}

function renderCockpitScene(dt, activeLeg, flightT, isRefuelingPhase, refuelT) {
    const w = cockpitCanvas.width;
    const h = cockpitCanvas.height;
    const cx = w * 0.5 + cockpitLookX;
    const cy = h * 0.48 + cockpitLookY;

    // Deep space backdrop
    const bg = cockpitCtx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(w, h) * 0.85);
    bg.addColorStop(0, activeLeg.disrupted ? "#1e0914" : "#071124");
    bg.addColorStop(0.6, "#02050d");
    bg.addColorStop(1, "#010205");
    cockpitCtx.fillStyle = bg;
    cockpitCtx.fillRect(0, 0, w, h);

    // Distant Sol Corona Glow with depth parallax
    const sunScreenX = w * 0.24 + cockpitLookX * 0.45;
    const sunScreenY = h * 0.26 + cockpitLookY * 0.45;
    const sunScale = activeLeg.to.sector === "INNER" ? 1.0 : (activeLeg.to.sector === "BELT" ? 0.55 : 0.32);
    if (sunCacheCanvas) {
        const sSize = 150 * sunScale;
        cockpitCtx.drawImage(sunCacheCanvas, sunScreenX - sSize * 0.5, sunScreenY - sSize * 0.5, sSize, sSize);
    }

    // 3D Forward-Streaming Starfield (slows nearly to a halt during orbital refueling)
    const velocity = cockpitPlaying
        ? (isRefuelingPhase ? 6 : 240 * cockpitSpeedMult)
        : 8;
    const fov = Math.min(w, h) * 0.55;

    for (let i = 0; i < cockpitStars.length; i++) {
        const s = cockpitStars[i];
        const prevZ = s.z;
        s.z -= velocity * dt;
        if (s.z <= 8) {
            s.x = (Math.random() - 0.5) * 2600;
            s.y = (Math.random() - 0.5) * 1800;
            s.z = 1120;
            continue;
        }

        const sx = cx + (s.x / s.z) * fov;
        const sy = cy + (s.y / s.z) * fov;
        if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;

        const alpha = Math.min(1, (1120 - s.z) / 500);
        cockpitCtx.strokeStyle = s.color;
        cockpitCtx.fillStyle = s.color;
        cockpitCtx.globalAlpha = alpha;

        if (cockpitPlaying && !isRefuelingPhase && cockpitSpeedMult >= 0.5) {
            const px = cx + (s.x / prevZ) * fov;
            const py = cy + (s.y / prevZ) * fov;
            cockpitCtx.lineWidth = Math.max(0.8, (1 - s.z / 1120) * 2.2);
            cockpitCtx.beginPath();
            cockpitCtx.moveTo(px, py);
            cockpitCtx.lineTo(sx, sy);
            cockpitCtx.stroke();
        } else {
            const rad = Math.max(0.7, (1 - s.z / 1120) * s.size * 1.9);
            cockpitCtx.beginPath();
            cockpitCtx.arc(sx, sy, rad, 0, Math.PI * 2);
            cockpitCtx.fill();
        }
    }
    cockpitCtx.globalAlpha = 1.0;

    // 3D Passing Asteroids when crossing Main Belt
    if (activeLeg.hasAsteroids) {
        for (let i = 0; i < cockpitAsteroids.length; i++) {
            const ast = cockpitAsteroids[i];
            ast.z -= velocity * 1.2 * dt;
            ast.rot += ast.rotSpeed * dt;
            if (ast.z <= 12) {
                ast.x = (Math.random() - 0.5) * 1900;
                ast.y = (Math.random() - 0.5) * 1200;
                ast.z = 1120;
                continue;
            }
            const ax = cx + (ast.x / ast.z) * fov;
            const ay = cy + (ast.y / ast.z) * fov;
            const aScale = Math.max(0.3, (1 - ast.z / 1120) * 3.8 * ast.scale);

            cockpitCtx.save();
            cockpitCtx.translate(ax, ay);
            cockpitCtx.rotate(ast.rot);
            cockpitCtx.scale(aScale, aScale);
            cockpitCtx.fillStyle = "#64748b";
            cockpitCtx.strokeStyle = "#94a3b8";
            cockpitCtx.lineWidth = 0.8;
            cockpitCtx.beginPath();
            cockpitCtx.moveTo(-8, -4);
            cockpitCtx.lineTo(0, -9);
            cockpitCtx.lineTo(9, -3);
            cockpitCtx.lineTo(6, 7);
            cockpitCtx.lineTo(-5, 8);
            cockpitCtx.closePath();
            cockpitCtx.fill();
            cockpitCtx.stroke();
            cockpitCtx.restore();
        }
    }

    // 3D Approaching Target Planet (Holds steady in close orbit during refueling)
    const approachCurve = Math.pow(flightT, 2.25);
    const baseTargetR = (activeLeg.to.name.includes("Jupiter") || activeLeg.to.name.includes("Saturn")) ? 165 : 132;
    const planetRadius = 7 + approachCurve * baseTargetR;
    const planetX = cx + Math.sin(flightT * Math.PI) * 38;
    const planetY = cy - 12 + approachCurve * 26;
    const lightAngle = Math.atan2(sunScreenY - planetY, sunScreenX - planetX);
    const spinAngle = performance.now() * 0.00035 + activeLeg.index;

    drawTexturedPlanet(cockpitCtx, activeLeg.to, planetX, planetY, planetRadius, lightAngle, spinAngle);

    // Holographic Target Acquisition Bracket around Approaching Planet
    const bracketR = planetRadius + 16;
    const bLen = Math.min(22, bracketR * 0.42);
    cockpitCtx.save();
    cockpitCtx.strokeStyle = isRefuelingPhase
        ? "rgba(250, 204, 21, 0.9)"
        : (activeLeg.disrupted ? "rgba(239, 68, 68, 0.85)" : "rgba(0, 240, 255, 0.78)");
    cockpitCtx.lineWidth = 1.6;

    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
        const bx = planetX + sx * bracketR;
        const by = planetY + sy * bracketR;
        cockpitCtx.beginPath();
        cockpitCtx.moveTo(bx, by - sy * bLen);
        cockpitCtx.lineTo(bx, by);
        cockpitCtx.lineTo(bx - sx * bLen, by);
        cockpitCtx.stroke();
    });

    const remainLegDist = Math.max(0, activeLeg.distMkm * (1 - flightT)).toFixed(1);
    cockpitCtx.fillStyle = isRefuelingPhase ? "#facc15" : "#00f0ff";
    cockpitCtx.font = "bold 11px 'Orbitron', sans-serif";
    cockpitCtx.textAlign = "center";
    const bracketLabel = isRefuelingPhase
        ? `ORBITAL STATION-KEEPING // REFUELING (${Math.round(refuelT * 100)}%)`
        : `TARGET: ${activeLeg.to.name.toUpperCase()} [${remainLegDist} Mkm]`;
    cockpitCtx.fillText(bracketLabel, planetX, planetY - bracketR - 10);
    cockpitCtx.restore();

    // Solar Flare / Radiation Storm Visual Overlay on Windshield
    if (activeLeg.disrupted && !isRefuelingPhase) {
        const pulse = 0.14 + Math.sin(performance.now() * 0.012) * 0.06;
        const stormGrad = cockpitCtx.createRadialGradient(cx, cy, w * 0.15, cx, cy, w * 0.65);
        stormGrad.addColorStop(0, "rgba(239, 68, 68, 0)");
        stormGrad.addColorStop(1, `rgba(239, 68, 68, ${pulse.toFixed(3)})`);
        cockpitCtx.fillStyle = stormGrad;
        cockpitCtx.fillRect(0, 0, w, h);
    }

    // Cryogenic Refueling Orbital Stream Effect when docked
    if (isRefuelingPhase) {
        cockpitCtx.save();
        cockpitCtx.strokeStyle = "rgba(56, 239, 125, 0.72)";
        cockpitCtx.lineWidth = 2.5;
        cockpitCtx.setLineDash([8, 10]);
        cockpitCtx.lineDashOffset = -performance.now() * 0.09;
        cockpitCtx.beginPath();
        cockpitCtx.moveTo(planetX, planetY);
        cockpitCtx.lineTo(w * 0.5 - cockpitLookX * 0.35, h * 0.85 - cockpitLookY * 0.35);
        cockpitCtx.stroke();
        cockpitCtx.restore();
    }

    // Center Flight Reticle (tracks gently with pilot head movement)
    drawCockpitReticle(w * 0.5 + cockpitLookX * 0.25, h * 0.48 + cockpitLookY * 0.25);

    // Foreground Starship Bridge Canopy Frame
    drawStarshipCanopyFrame(w, h);
}

function drawCockpitReticle(cx, cy) {
    cockpitCtx.save();
    cockpitCtx.strokeStyle = "rgba(56, 189, 248, 0.36)";
    cockpitCtx.lineWidth = 1.2;

    cockpitCtx.beginPath();
    cockpitCtx.arc(cx, cy, 42, -0.35, 0.35);
    cockpitCtx.stroke();
    cockpitCtx.beginPath();
    cockpitCtx.arc(cx, cy, 42, Math.PI - 0.35, Math.PI + 0.35);
    cockpitCtx.stroke();

    cockpitCtx.beginPath();
    cockpitCtx.moveTo(cx - 12, cy);
    cockpitCtx.lineTo(cx - 4, cy);
    cockpitCtx.moveTo(cx + 4, cy);
    cockpitCtx.lineTo(cx + 12, cy);
    cockpitCtx.moveTo(cx, cy - 10);
    cockpitCtx.lineTo(cx, cy - 4);
    cockpitCtx.stroke();

    cockpitCtx.restore();
}

function drawStarshipCanopyFrame(w, h) {
    const ox = -cockpitLookX * 0.38;
    const oy = -cockpitLookY * 0.38;

    cockpitCtx.save();

    const glassVignette = cockpitCtx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.36, w * 0.5, h * 0.48, Math.max(w, h) * 0.72);
    glassVignette.addColorStop(0, "rgba(56, 189, 248, 0)");
    glassVignette.addColorStop(0.85, "rgba(14, 165, 233, 0.05)");
    glassVignette.addColorStop(1, "rgba(2, 6, 18, 0.75)");
    cockpitCtx.fillStyle = glassVignette;
    cockpitCtx.fillRect(0, 0, w, h);

    cockpitCtx.fillStyle = "#060b16";
    cockpitCtx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    cockpitCtx.lineWidth = 1.5;

    // Left Angled A-Pillar Strut
    cockpitCtx.beginPath();
    cockpitCtx.moveTo(-80, -80);
    cockpitCtx.lineTo(w * 0.13 + ox, -80);
    cockpitCtx.lineTo(w * 0.04 + ox, h * 0.78 + oy);
    cockpitCtx.lineTo(-80, h + 80);
    cockpitCtx.closePath();
    cockpitCtx.fill();
    cockpitCtx.stroke();

    // Right Angled A-Pillar Strut
    cockpitCtx.beginPath();
    cockpitCtx.moveTo(w + 80, -80);
    cockpitCtx.lineTo(w * 0.87 + ox, -80);
    cockpitCtx.lineTo(w * 0.96 + ox, h * 0.78 + oy);
    cockpitCtx.lineTo(w + 80, h + 80);
    cockpitCtx.closePath();
    cockpitCtx.fill();
    cockpitCtx.stroke();

    // Lower Starship Dashboard Cowling
    cockpitCtx.beginPath();
    cockpitCtx.moveTo(-80, h + 80);
    cockpitCtx.lineTo(w * 0.04 + ox, h * 0.78 + oy);
    cockpitCtx.lineTo(w * 0.28 + ox, h * 0.87 + oy);
    cockpitCtx.lineTo(w * 0.72 + ox, h * 0.87 + oy);
    cockpitCtx.lineTo(w * 0.96 + ox, h * 0.78 + oy);
    cockpitCtx.lineTo(w + 80, h + 80);
    cockpitCtx.closePath();
    cockpitCtx.fill();
    cockpitCtx.stroke();

    cockpitCtx.restore();
}

function updateCockpitTelemetryHUD(activeLeg, flightT, isRefuelingPhase, refuelT) {
    let currentFuel = maxFuelTons;
    let cumRad = 0;
    let distTraveled = 0;

    for (let i = 0; i < activeLeg.index; i++) {
        const leg = cockpitLegs[i];
        currentFuel = Math.max(0, currentFuel - leg.fuelTons);
        if (leg.willRefuel) currentFuel = maxFuelTons;
        cumRad += leg.radMsv;
        distTraveled += leg.distMkm;
    }

    currentFuel = Math.max(0, currentFuel - activeLeg.fuelTons * flightT);
    if (isRefuelingPhase) {
        currentFuel = currentFuel + (maxFuelTons - currentFuel) * refuelT;
    }
    cumRad += activeLeg.radMsv * flightT;
    distTraveled += activeLeg.distMkm * flightT;

    const totalDist = activeRouteData.totalDistance || 1;
    const distRemain = Math.max(0, totalDist - distTraveled);
    const totalHazard = Math.max(1, activeRouteData.totalHazard || 100);

    const legTitle = document.getElementById("cockpitLegTitle");
    if (legTitle) {
        legTitle.innerText = `LEG ${activeLeg.index + 1}/${cockpitLegs.length}: ${activeLeg.from.name.toUpperCase()} → ${activeLeg.to.name.toUpperCase()}`;
    }

    const statusPill = document.getElementById("cockpitFlightStatus");
    if (statusPill) {
        statusPill.classList.remove("warning", "refuel");
        if (cockpitProgress >= 1.0) {
            statusPill.innerText = `DESTINATION ORBIT REACHED // ${activeLeg.to.name.toUpperCase()}`;
        } else if (isRefuelingPhase) {
            statusPill.classList.add("refuel");
            statusPill.innerText = `THRUSTERS IDLE // REFUELING AT ${activeLeg.to.name.toUpperCase()} (${Math.round(refuelT * 100)}%)`;
        } else if (activeLeg.disrupted) {
            statusPill.classList.add("warning");
            statusPill.innerText = `ALERT: ${activeLeg.disruptionReason.toUpperCase()} TURBULENCE`;
        } else {
            statusPill.innerText = `FUSION TORCH CRUISE // ${cockpitSpeedMult}x THRUST`;
        }
    }

    const fuelPct = Math.min(100, Math.max(0, (currentFuel / maxFuelTons) * 100));
    const fuelValEl = document.getElementById("cockpitFuelVal");
    const fuelBarEl = document.getElementById("cockpitFuelBar");
    if (fuelValEl) fuelValEl.innerText = `${currentFuel.toFixed(1)} / ${maxFuelTons} t`;
    if (fuelBarEl) fuelBarEl.style.width = `${fuelPct.toFixed(1)}%`;

    const radPct = Math.min(100, (cumRad / totalHazard) * 100);
    const radValEl = document.getElementById("cockpitRadVal");
    const radBarEl = document.getElementById("cockpitRadBar");
    if (radValEl) radValEl.innerText = `${cumRad.toFixed(1)} mSv`;
    if (radBarEl) radBarEl.style.width = `${radPct.toFixed(1)}%`;

    const velocityKms = cockpitProgress >= 1.0 ? 0 : (isRefuelingPhase ? 0 : Math.round(214 * cockpitSpeedMult));
    const liveLatency = Math.round(((distTraveled * 3.335) / 60.0) * 10) / 10;

    document.getElementById("cockpitSpeedVal").innerText = isRefuelingPhase ? "0 km/s (DOCKED)" : `${velocityKms} km/s`;
    document.getElementById("cockpitDistRemainVal").innerText = `${distRemain.toFixed(1)} Mkm`;
    document.getElementById("cockpitLatencyVal").innerText = `${liveLatency} min`;
    document.getElementById("cockpitNoiseVal").innerText = `${Math.round(activeLeg.interference * 100)}%`;

    document.getElementById("cockpitTargetSector").innerText = `${activeLeg.to.sector || "SOLAR"} SECTOR`;
    document.getElementById("cockpitTargetDist").innerText = `${Math.max(0, activeLeg.distMkm * (1 - flightT)).toFixed(1)} Mkm`;
    document.getElementById("cockpitTargetName").innerText = activeLeg.to.name.toUpperCase();
    document.getElementById("cockpitTargetAtmo").innerText = `Atmosphere: ${activeLeg.to.atmosphere || "Vacuum"}`;

    const refuelNote = document.getElementById("cockpitTargetRefuel");
    if (refuelNote) {
        if (activeLeg.willRefuel) {
            refuelNote.innerText = `REFUEL DEPOT: SCHEDULED ($${activeLeg.to.refuelCostPerTon}/t)`;
            refuelNote.style.color = "#facc15";
        } else if (activeLeg.to.hasRefuelDepot) {
            refuelNote.innerText = `REFUEL DEPOT: AVAILABLE ($${activeLeg.to.refuelCostPerTon}/t)`;
            refuelNote.style.color = "#38ef7d";
        } else {
            refuelNote.innerText = "NO PROPELLANT DEPOT AT WAYPOINT";
            refuelNote.style.color = "#94a3b8";
        }
    }

    document.querySelectorAll("#cockpitLegList .c-leg-item").forEach((el, idx) => {
        el.classList.toggle("done", idx < activeLeg.index || cockpitProgress >= 1.0);
        el.classList.toggle("active", idx === activeLeg.index && cockpitProgress < 1.0);
    });

    const pctDone = Math.round(cockpitProgress * 100);
    const remainDaysTotal = distRemain / 18.5;
    const remDays = Math.floor(remainDaysTotal);
    const remHours = Math.round((remainDaysTotal - remDays) * 24);
    const etaEl = document.getElementById("cockpitEtaLabel");
    if (etaEl) {
        etaEl.innerText = `${pctDone}% // ETA ${remDays}d ${remHours}h`;
    }
}

function setupCockpitListeners() {
    document.getElementById("btnOpenCockpit")?.addEventListener("click", openCockpitJourneyView);
    document.getElementById("btnOpenCockpitTour")?.addEventListener("click", openCockpitJourneyView);
    document.getElementById("btnHudCockpit")?.addEventListener("click", openCockpitJourneyView);
    document.getElementById("btnCloseCockpit")?.addEventListener("click", closeCockpitJourneyView);

    document.getElementById("btnToggleCockpitHud")?.addEventListener("click", (e) => {
        const win = document.getElementById("cockpitJourneyWindow");
        if (!win) return;
        const minimal = win.classList.toggle("minimal-hud");
        e.target.innerText = minimal ? "HUD: MINIMAL" : "HUD: FULL";
    });

    document.getElementById("btnCockpitPlayPause")?.addEventListener("click", (e) => {
        if (cockpitProgress >= 1.0) {
            cockpitProgress = 0;
            cockpitPlaying = true;
            e.target.innerText = "PAUSE";
            return;
        }
        cockpitPlaying = !cockpitPlaying;
        e.target.innerText = cockpitPlaying ? "PAUSE" : "RESUME";
    });

    document.getElementById("btnCockpitReplay")?.addEventListener("click", () => {
        cockpitProgress = 0;
        cockpitPlaying = true;
        const playBtn = document.getElementById("btnCockpitPlayPause");
        if (playBtn) playBtn.innerText = "PAUSE";
    });

    document.querySelectorAll(".warp-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".warp-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            cockpitSpeedMult = parseFloat(btn.dataset.speed) || 1;
        });
    });

    document.getElementById("cockpitScrubber")?.addEventListener("input", (e) => {
        cockpitProgress = Math.max(0, Math.min(1, parseFloat(e.target.value) / 1000));
    });

    const cockpitWin = document.getElementById("cockpitJourneyWindow");
    cockpitWin?.addEventListener("mousemove", (e) => {
        const nx = (e.clientX / window.innerWidth) - 0.5;
        const ny = (e.clientY / window.innerHeight) - 0.5;
        cockpitTargetLookX = -nx * 240;
        cockpitTargetLookY = -ny * 165;
    });

    cockpitWin?.addEventListener("mouseleave", () => {
        cockpitTargetLookX = 0;
        cockpitTargetLookY = 0;
    });

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && cockpitOpen) {
            closeCockpitJourneyView();
        }
    });
}

// ============================================================================
// 9. UI Event Listeners & Toast Alerts
// ============================================================================
function setupControlListeners() {
    const toggleBtn = document.getElementById("btnToggleSidebar");
    const arrow = document.getElementById("toggleArrow");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            document.body.classList.toggle("sidebar-collapsed");
            const collapsed = document.body.classList.contains("sidebar-collapsed");
            if (arrow) arrow.innerHTML = collapsed ? "&#9664;" : "&#9654;";
        });
    }

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            btn.classList.add("active");
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.classList.add("active");
        });
    });

    document.getElementById("btnResetView")?.addEventListener("click", () => {
        zoom = 1.0;
        panX = 0;
        panY = 0;
    });

    document.getElementById("btnToggleOrbits")?.addEventListener("click", (e) => {
        showOrbits = !showOrbits;
        e.target.classList.toggle("active", showOrbits);
        e.target.innerText = showOrbits ? "ORBITS: ON" : "ORBITS: OFF";
    });

    document.getElementById("btnToggleMST")?.addEventListener("click", toggleRelayMST);

    document.getElementById("fuelTankInput")?.addEventListener("change", (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            maxFuelTons = val;
            updateShipHUD();
        }
    });

    document.getElementById("btnCalculate")?.addEventListener("click", computeOptimalRoute);
    document.getElementById("btnComputeTour")?.addEventListener("click", computeMultiStopTour);
    document.getElementById("btnRefreshLogs")?.addEventListener("click", refreshLeaderboard);

    document.getElementById("btnTriggerStorm")?.addEventListener("click", () => {
        const val = document.getElementById("hazardEdgeSelect")?.value;
        if (!val) return;
        const [src, dst] = val.split("|");
        triggerWeatherOnCorridor(src, dst, "Class-X Solar Flare");
    });

    document.getElementById("btnUndoHazard")?.addEventListener("click", undoLastWeatherEvent);

    document.getElementById("closeCommandDeck")?.addEventListener("click", closePlanetaryCommandDeck);
    document.getElementById("deckBackdrop")?.addEventListener("click", closePlanetaryCommandDeck);

    document.getElementById("btnSetOrigin")?.addEventListener("click", () => {
        if (selectedDeckPlanet) {
            document.getElementById("startPlanet").value = selectedDeckPlanet.id;
            showNotification(`Origin set to ${selectedDeckPlanet.name}.`, "info");
            closePlanetaryCommandDeck();
        }
    });

    document.getElementById("btnSetDest")?.addEventListener("click", () => {
        if (selectedDeckPlanet) {
            document.getElementById("destPlanet").value = selectedDeckPlanet.id;
            showNotification(`Destination set to ${selectedDeckPlanet.name}.`, "info");
            closePlanetaryCommandDeck();
        }
    });
}

function updateShipHUD() {
    const fuelEl = document.getElementById("hudFuelCap");
    const shieldEl = document.getElementById("hudShieldBonus");
    if (fuelEl) fuelEl.innerText = `${maxFuelTons} t`;
    if (shieldEl) shieldEl.innerText = `${Math.round(shieldBonus * 100)}%`;
}

function showNotification(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    const isErr = type === "error";
    toast.style.cssText = `
        background: ${isErr ? "rgba(220, 38, 38, 0.94)" : "rgba(14, 165, 233, 0.94)"};
        border: 1px solid ${isErr ? "#fca5a5" : "#7dd3fc"};
        color: #ffffff;
        padding: 10px 15px;
        border-radius: 6px;
        font-family: 'Rajdhani', sans-serif;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 6px 18px rgba(0,0,0,0.45);
        transition: opacity 0.3s ease;
    `;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}