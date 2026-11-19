// ============================================================================
// StarTrace — 3D-Parallax Solar Sector Engine & Aerospace DSA Controller
// ============================================================================

const API_BASE_URL = "http://localhost:8080/api";

let canvas, ctx;
let planetsData = [];
let edgesData = [];
let activeRouteData = null;
let mstData = null;

// Environment & Simulation State
let stars = [];
let nebulaClouds = [];
let beltAsteroids = [];
let globalTime = 0;
let showOrbits = true;
let showMST = false;
let shipPulseProgress = 0;

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

// Bulletproof initialization that fires immediately if DOM is ready
function initStarTraceApp() {
    runCinematicBootSequence();

    canvas = document.getElementById("galaxyCanvas");
    if (canvas) {
        ctx = canvas.getContext("2d");
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);
        setupCanvasInteractions();
    }

    setupControlListeners();
    loadInitialNetworkData();
    startMainLoop();
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
    if (!overlay || !fill) return;

    const steps = [
        { pct: 30, msg: "INITIALIZING KEPLERIAN ORBITAL MECHANICS..." },
        { pct: 68, msg: "LOADING ADJACENCY GRAPH, MIN-HEAP & DISJOINT SET..." },
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
            setTimeout(() => {
                overlay.classList.add("fade-out");
                setTimeout(() => overlay.remove(), 950);
            }, 350);
        }
    }, 420);
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
// 3. 3D-Parallax Deep Space Canvas & Asteroid Belt Renderer
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

    stars = [];
    const starCount = Math.floor((w * h) / 1400);
    const palette = ["#ffffff", "#bae6fd", "#fef08a", "#fed7aa", "#c4b5fd"];

    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            depth: Math.random() * 0.6 + 0.1,
            radius: Math.random() * 1.4 + 0.3,
            color: palette[Math.floor(Math.random() * palette.length)],
            alpha: Math.random() * 0.7 + 0.25,
            twinkle: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.025 + 0.005
        });
    }

    nebulaClouds = [
        { x: w * 0.35, y: h * 0.45, r: Math.max(w, h) * 0.45, c1: "rgba(56, 189, 248, 0.09)", c2: "rgba(15, 23, 42, 0)" },
        { x: w * 0.65, y: h * 0.55, r: Math.max(w, h) * 0.42, c1: "rgba(139, 92, 246, 0.09)", c2: "rgba(15, 23, 42, 0)" }
    ];

    beltAsteroids = [];
    for (let i = 0; i < 185; i++) {
        const orbitR = 175 + Math.random() * 48;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.018 + Math.random() * 0.008;
        const size = Math.random() * 2.4 + 1.1;
        const verts = 6;
        const offsets = Array.from({ length: verts }, () => 0.7 + Math.random() * 0.5);
        beltAsteroids.push({
            orbitR, angle, speed, size, verts, offsets,
            selfRot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.04,
            shade: Math.random() > 0.5 ? "#64748b" : "#475569"
        });
    }
}

function startMainLoop() {
    function loop() {
        globalTime += 0.015;
        shipPulseProgress = (shipPulseProgress + 0.006) % 1.0;

        const clockEl = document.getElementById("simClockBadge");
        if (clockEl) {
            const simDay = Math.floor(globalTime * 12);
            clockEl.innerText = `EPOCH: DAY ${String(simDay).padStart(3, "0")} | LIVE ORBITS`;
        }

        renderSolarSystem();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

function renderSolarSystem() {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const bg = ctx.createRadialGradient(w * 0.45, h * 0.5, 40, w * 0.45, h * 0.5, Math.max(w, h));
    bg.addColorStop(0, "#081021");
    bg.addColorStop(0.55, "#030712");
    bg.addColorStop(1, "#010205");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    nebulaClouds.forEach(n => {
        const g = ctx.createRadialGradient(n.x + panX * 0.15, n.y + panY * 0.15, 10, n.x + panX * 0.15, n.y + panY * 0.15, n.r);
        g.addColorStop(0, n.c1);
        g.addColorStop(1, n.c2);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x + panX * 0.15, n.y + panY * 0.15, n.r, 0, Math.PI * 2);
        ctx.fill();
    });

    stars.forEach(s => {
        s.twinkle += s.speed;
        const sx = ((s.x + panX * s.depth) % w + w) % w;
        const sy = ((s.y + panY * s.depth) % h + h) % h;
        ctx.globalAlpha = Math.max(0.1, Math.min(1, s.alpha + Math.sin(s.twinkle) * 0.3));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const sunX = (w * 0.42);
    const sunY = (h * 0.50);

    currentMappedPlanets = planetsData.map(p => {
        const angle = (p.initialAngle || 0) + (globalTime * (p.orbitSpeed || 0.015));
        const r = p.orbitRadius || 100;
        return {
            ...p,
            canvasX: sunX + Math.cos(angle) * r,
            canvasY: sunY + Math.sin(angle) * r,
            currentAngle: angle
        };
    });

    if (showOrbits) drawOrbitalTracks(sunX, sunY, currentMappedPlanets);
    drawMainAsteroidBelt(sunX, sunY);
    drawCentralSun(sunX, sunY);
    drawSpaceCorridors(currentMappedPlanets);

    if (showMST && mstData && mstData.mstEdges) {
        drawMSTOverlay(currentMappedPlanets, mstData.mstEdges);
    }

    if (activeRouteData && activeRouteData.path && activeRouteData.path.length > 1) {
        drawActiveMissionPath(currentMappedPlanets, activeRouteData.path);
    }

    currentMappedPlanets.forEach(node => {
        drawCelestialNode(node, sunX, sunY);
    });

    ctx.restore();
}

function drawCentralSun(sunX, sunY) {
    const corona = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 68);
    corona.addColorStop(0, "rgba(254, 240, 138, 0.95)");
    corona.addColorStop(0.28, "rgba(245, 158, 11, 0.55)");
    corona.addColorStop(0.65, "rgba(234, 88, 12, 0.15)");
    corona.addColorStop(1, "rgba(234, 88, 12, 0)");

    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 68, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(sunX - 5, sunY - 5, 2, sunX, sunY, 22);
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.45, "#fef08a");
    core.addColorStop(1, "#f59e0b");

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fde047";
    ctx.font = "bold 10px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SOL (SUN)", sunX, sunY + 36);
}

function drawOrbitalTracks(sunX, sunY, mapped) {
    ctx.save();
    mapped.forEach(p => {
        ctx.beginPath();
        ctx.arc(sunX, sunY, p.orbitRadius, 0, Math.PI * 2);
        ctx.strokeStyle = p.sector === "INNER" ? "rgba(56, 189, 248, 0.14)" : "rgba(148, 163, 184, 0.10)";
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
    });
    ctx.restore();
}

function drawMainAsteroidBelt(sunX, sunY) {
    ctx.save();
    beltAsteroids.forEach(ast => {
        ast.angle += ast.speed * 0.015;
        ast.selfRot += ast.rotSpeed;

        const ax = sunX + Math.cos(ast.angle) * ast.orbitR;
        const ay = sunY + Math.sin(ast.angle) * ast.orbitR;

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ast.selfRot);
        ctx.beginPath();
        for (let i = 0; i < ast.verts; i++) {
            const a = (i / ast.verts) * Math.PI * 2;
            const r = ast.size * ast.offsets[i];
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = ast.shade;
        ctx.fill();
        ctx.restore();
    });
    ctx.restore();
}

function drawSpaceCorridors(mapped) {
    currentMappedEdges = [];

    edgesData.forEach(edge => {
        const a = mapped.find(p => p.id === edge.sourcePlanetId);
        const b = mapped.find(p => p.id === edge.targetPlanetId);
        if (!a || !b) return;

        currentMappedEdges.push({
            edge,
            x1: a.canvasX, y1: a.canvasY,
            x2: b.canvasX, y2: b.canvasY
        });

        const isHovered = hoveredEdge &&
            hoveredEdge.sourcePlanetId === edge.sourcePlanetId &&
            hoveredEdge.targetPlanetId === edge.targetPlanetId;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.canvasX, a.canvasY);
        ctx.lineTo(b.canvasX, b.canvasY);

        if (edge.disrupted) {
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = (isHovered ? 3.5 : 2.2) / zoom;
            ctx.setLineDash([6, 4]);
            ctx.shadowColor = "#ef4444";
            ctx.shadowBlur = 10;
        } else {
            ctx.strokeStyle = isHovered ? "rgba(56, 189, 248, 0.75)" : "rgba(56, 189, 248, 0.16)";
            ctx.lineWidth = (isHovered ? 2.5 : 1.0) / zoom;
        }
        ctx.stroke();

        if (edge.disrupted) {
            const mx = (a.canvasX + b.canvasX) / 2;
            const my = (a.canvasY + b.canvasY) / 2;
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(mx, my, 7 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.max(8, 10 / zoom)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("!", mx, my + 3.5 / zoom);
        }
        ctx.restore();
    });
}

function drawMSTOverlay(mapped, mstEdges) {
    ctx.save();
    ctx.strokeStyle = "#38ef7d";
    ctx.lineWidth = 2.6 / zoom;
    ctx.shadowColor = "#38ef7d";
    ctx.shadowBlur = 12;

    mstEdges.forEach(link => {
        const a = mapped.find(p => p.id === link.sourceId);
        const b = mapped.find(p => p.id === link.targetId);
        if (!a || !b) return;
        ctx.beginPath();
        ctx.moveTo(a.canvasX, a.canvasY);
        ctx.lineTo(b.canvasX, b.canvasY);
        ctx.stroke();
    });
    ctx.restore();
}

function drawActiveMissionPath(mapped, path) {
    const coords = path.map(step => mapped.find(p => p.id === step.id)).filter(Boolean);
    if (coords.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 3.5 / zoom;
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 18;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -globalTime * 25;

    coords.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.canvasX, pt.canvasY);
        else ctx.lineTo(pt.canvasX, pt.canvasY);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const totalSegs = coords.length - 1;
    const scaledPos = shipPulseProgress * totalSegs;
    const segIdx = Math.min(totalSegs - 1, Math.floor(scaledPos));
    const segT = scaledPos - segIdx;

    const pStart = coords[segIdx];
    const pEnd = coords[segIdx + 1];
    const shipX = pStart.canvasX + (pEnd.canvasX - pStart.canvasX) * segT;
    const shipY = pStart.canvasY + (pEnd.canvasY - pStart.canvasY) * segT;

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#38ef7d";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(shipX, shipY, 5.5 / zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawCelestialNode(node, sunX, sunY) {
    const x = node.canvasX;
    const y = node.canvasY;
    const color = node.color || "#38bdf8";
    const nameLower = (node.name || "").toLowerCase();
    const isHovered = hoveredPlanet && hoveredPlanet.id === node.id;

    const lightAngle = Math.atan2(sunY - y, sunX - x);
    const radius = nameLower.includes("jupiter") || nameLower.includes("saturn") ? 14 :
        (nameLower.includes("luna") || nameLower.includes("europa") || nameLower.includes("titan") ? 8.5 : 11);

    ctx.save();
    ctx.translate(x, y);

    if (isHovered) {
        ctx.beginPath();
        ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (nameLower.includes("saturn")) {
        ctx.save();
        ctx.rotate(-0.42);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 2.2, radius * 0.65, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.75)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    const lx = Math.cos(lightAngle) * (radius * 0.45);
    const ly = Math.sin(lightAngle) * (radius * 0.45);
    const sphereGrad = ctx.createRadialGradient(lx, ly, radius * 0.1, 0, 0, radius);
    sphereGrad.addColorStop(0, "#ffffff");
    sphereGrad.addColorStop(0.35, color);
    sphereGrad.addColorStop(1, "#090d16");

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.shadowColor = color;
    ctx.shadowBlur = isHovered ? 20 : 10;
    ctx.fill();

    if (node.hasRefuelDepot) {
        ctx.beginPath();
        ctx.arc(0, 0, radius + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(56, 239, 125, 0.75)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px 'Orbitron', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(node.id, x, y - radius - 8);

    ctx.fillStyle = isHovered ? "#38bdf8" : "#cbd5e1";
    ctx.font = "600 11px 'Rajdhani', sans-serif";
    ctx.fillText(node.name, x, y + radius + 14);
}

// ============================================================================
// 4. Robust Scaled Mouse Interactions & Hit Detection
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
        for (let p of currentMappedPlanets) {
            if (Math.hypot(wx - p.canvasX, wy - p.canvasY) <= 24) {
                hoveredPlanet = p;
                break;
            }
        }

        hoveredEdge = null;
        if (!hoveredPlanet) {
            for (let item of currentMappedEdges) {
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
        for (let p of currentMappedPlanets) {
            if (Math.hypot(wx - p.canvasX, wy - p.canvasY) <= 26) {
                clickedPlanet = p;
                break;
            }
        }

        let clickedEdge = null;
        if (!clickedPlanet) {
            for (let item of currentMappedEdges) {
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
// 5. Backend API Actions & UI Handlers
// ============================================================================
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
        shipPulseProgress = 0;
        renderMissionTelemetry(data);
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
        shipPulseProgress = 0;
        renderMissionTelemetry(data);
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
// 6. Full-Height Planetary Command Deck & Interactive Upgrades
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
    if (deckAnimId) cancelAnimationFrame(deckAnimId);
}

function startDeckPlanetAnimation(planet) {
    const pCanvas = document.getElementById("planetDetailCanvas");
    if (!pCanvas) return;
    const pCtx = pCanvas.getContext("2d");
    let angle = 0;

    function animatePlanet() {
        angle += 0.015;
        const w = pCanvas.width;
        const h = pCanvas.height;
        pCtx.clearRect(0, 0, w, h);

        pCtx.strokeStyle = "rgba(56, 189, 248, 0.1)";
        pCtx.lineWidth = 1;
        for (let x = 0; x < w; x += 25) { pCtx.beginPath(); pCtx.moveTo(x, 0); pCtx.lineTo(x, h); pCtx.stroke(); }
        for (let y = 0; y < h; y += 25) { pCtx.beginPath(); pCtx.moveTo(0, y); pCtx.lineTo(w, y); pCtx.stroke(); }

        const cx = w / 2;
        const cy = h / 2;
        const r = 64;
        const col = planet.color || "#38bdf8";

        const halo = pCtx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.45);
        halo.addColorStop(0, col + "66");
        halo.addColorStop(1, "rgba(0,0,0,0)");
        pCtx.fillStyle = halo;
        pCtx.beginPath();
        pCtx.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
        pCtx.fill();

        const bodyGrad = pCtx.createRadialGradient(cx - 24, cy - 24, 8, cx, cy, r);
        bodyGrad.addColorStop(0, "#ffffff");
        bodyGrad.addColorStop(0.35, col);
        bodyGrad.addColorStop(1, "#050811");
        pCtx.fillStyle = bodyGrad;
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, 0, Math.PI * 2);
        pCtx.fill();

        const satX = cx + Math.cos(angle) * 96;
        const satY = cy + Math.sin(angle) * 34;
        pCtx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        pCtx.beginPath();
        pCtx.ellipse(cx, cy, 96, 34, 0, 0, Math.PI * 2);
        pCtx.stroke();

        pCtx.fillStyle = "#38ef7d";
        pCtx.beginPath();
        pCtx.arc(satX, satY, 4.5, 0, Math.PI * 2);
        pCtx.fill();

        deckAnimId = requestAnimationFrame(animatePlanet);
    }
    if (deckAnimId) cancelAnimationFrame(deckAnimId);
    animatePlanet();
}

// ============================================================================
// 7. UI Event Listeners & Toast Alerts
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
        zoom = 1.0; panX = 0; panY = 0;
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
        background: ${isErr ? "rgba(220, 38, 38, 0.92)" : "rgba(14, 165, 233, 0.92)"};
        border: 1px solid ${isErr ? "#fca5a5" : "#7dd3fc"};
        color: #ffffff;
        padding: 10px 15px;
        border-radius: 6px;
        font-family: 'Rajdhani', sans-serif;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 6px 18px rgba(0,0,0,0.45);
        transition: all 0.3s ease;
    `;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}