package com.startrace.service;

import com.startrace.dsa.MissionLogTree;
import com.startrace.dsa.MissionLogTree.MissionRecord;
import com.startrace.dsa.NetworkActionStack;
import com.startrace.dsa.NetworkActionStack.HazardEvent;
import com.startrace.model.PlanetNode;
import com.startrace.model.SpaceRouteEdge;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class GraphService {

    private final Map<String, PlanetNode> planets = new LinkedHashMap<>();
    private final Map<String, List<SpaceRouteEdge>> adjacencyList = new HashMap<>();
    private final MissionLogTree missionLogTree = new MissionLogTree();
    private final NetworkActionStack actionStack = new NetworkActionStack();
    private int missionCounter = 100;

    public GraphService() {
        initializeSolarNetwork();
    }

    private void initializeSolarNetwork() {
        // --- INNER ROCKY SYSTEM (Faster Orbits, Inside Asteroid Belt) ---
        addPlanet(new PlanetNode("P1", "Mercury Relay", "INNER", 58.0, 0.0, 55.0, 0.154, 0.4, "#94a3b8",
                false, 0.0, "Exosphere (Trace Sodium)", "High-temperature solar observation relay and laser comms repeater."));
        addPlanet(new PlanetNode("P2", "Venus Orbital", "INNER", 108.0, 0.0, 82.0, 0.112, 1.9, "#fbbf24",
                false, 0.0, "Dense CO2 Cloud Deck", "Upper-atmosphere aerostat research hub and inner-system gravity-assist waypoint."));
        addPlanet(new PlanetNode("P3", "Earth (Sol Prime)", "INNER", 149.6, 0.0, 112.0, 0.093, 3.1, "#38bdf8",
                true, 450.0, "Nitrogen-Oxygen (1.0 atm)", "Primary humanity headquarters, orbital shipyard, and deep-space propellant refinery."));
        addPlanet(new PlanetNode("P4", "Luna Gateway", "INNER", 150.0, 0.0, 126.0, 0.102, 3.35, "#e2e8f0",
                true, 380.0, "Vacuum / Pressurized Domes", "Low-gravity Helium-3 & LH2 propellant depot ideal for interplanetary launches."));
        addPlanet(new PlanetNode("P5", "Mars Colony", "INNER", 227.9, 0.0, 155.0, 0.077, 4.7, "#f97316",
                true, 520.0, "Thin CO2 (0.006 atm)", "Olympus terraforming command and primary staging port before the Main Asteroid Belt."));

        // --- MAIN ASTEROID BELT DEPOT ---
        addPlanet(new PlanetNode("P6", "Ceres Mining Depot", "BELT", 413.0, 0.0, 195.0, 0.054, 1.1, "#a855f7",
                true, 310.0, "Vacuum / Subsurface Caverns", "Water-ice electrolysis refinery providing the cheapest propellant in the solar system."));

        // --- OUTER GAS & ICE GIANTS (Slower Orbits, Outside Asteroid Belt) ---
        addPlanet(new PlanetNode("P7", "Jupiter Gateway", "OUTER", 778.5, 0.0, 245.0, 0.042, 2.4, "#eab308",
                false, 0.0, "Hydrogen-Helium Magnetosphere", "High-radiation gravitational slingshot hub serving the Galilean moons."));
        addPlanet(new PlanetNode("P8", "Europa Research Base", "OUTER", 779.0, 0.0, 265.0, 0.045, 2.65, "#06b6d4",
                true, 490.0, "Tenuous Oxygen / Sub-ice Ocean", "Cryogenic deuterium-tritium fuel harvesting station and astrobiology lab."));
        addPlanet(new PlanetNode("P9", "Saturn Ring Station", "OUTER", 1434.0, 0.0, 305.0, 0.029, 5.2, "#facc15",
                false, 0.0, "Ring Ice & Ionized Plasma", "Cassini Division sensor array and long-range quantum laser transceiver."));
        addPlanet(new PlanetNode("P10", "Titan Colony", "OUTER", 1435.0, 0.0, 325.0, 0.032, 5.45, "#fb923c",
                true, 410.0, "Dense Nitrogen-Methane (1.45 atm)", "Liquid hydrocarbon propellant lakes and outer-system logistics fortress."));
        addPlanet(new PlanetNode("P11", "Uranus Relay", "OUTER", 2871.0, 0.0, 365.0, 0.019, 0.8, "#22d3ee",
                false, 0.0, "Hydrogen-Helium-Methane", "Autonomous deep-space telemetry buoy bridging the ice giants."));
        addPlanet(new PlanetNode("P12", "Neptune Outpost", "OUTER", 4495.0, 0.0, 405.0, 0.016, 4.1, "#3b82f6",
                true, 680.0, "Supersonic Methane Winds", "Triton cryovolcanic refueling terminal and Kuiper Belt frontier gateway."));

        // --- INTERPLANETARY SPACE CORRIDORS (Source, Target, BaseDist Mkm, Interference, Hazard mSv, Fuel Tons) ---
        addBidirectionalRoute("P1", "P2", 50.2, 0.22, 42.0, 65.0);
        addBidirectionalRoute("P1", "P3", 91.6, 0.30, 55.0, 110.0);
        addBidirectionalRoute("P2", "P3", 41.4, 0.12, 18.0, 52.0);
        addBidirectionalRoute("P3", "P4", 1.2, 0.02, 2.5, 12.0);
        addBidirectionalRoute("P3", "P5", 78.3, 0.08, 14.0, 85.0);
        addBidirectionalRoute("P4", "P5", 77.5, 0.06, 12.0, 80.0);

        addBidirectionalRoute("P5", "P6", 185.0, 0.14, 22.0, 145.0);
        addBidirectionalRoute("P6", "P7", 365.0, 0.18, 38.0, 240.0);
        addBidirectionalRoute("P5", "P7", 550.0, 0.25, 48.0, 360.0);

        addBidirectionalRoute("P7", "P8", 4.5, 0.15, 65.0, 18.0);
        addBidirectionalRoute("P7", "P9", 655.0, 0.20, 30.0, 390.0);
        addBidirectionalRoute("P8", "P9", 650.0, 0.16, 26.0, 380.0);
        addBidirectionalRoute("P9", "P10", 6.0, 0.07, 10.0, 20.0);
        addBidirectionalRoute("P10", "P11", 1436.0, 0.28, 35.0, 520.0);
        addBidirectionalRoute("P11", "P12", 1624.0, 0.34, 42.0, 560.0);

        addBidirectionalRoute("P2", "P5", 119.0, 0.19, 32.0, 115.0);
        addBidirectionalRoute("P6", "P8", 368.0, 0.14, 34.0, 235.0);
        addBidirectionalRoute("P8", "P10", 652.0, 0.15, 24.0, 375.0);
    }

    private void addPlanet(PlanetNode planet) {
        planets.put(planet.getId(), planet);
        adjacencyList.putIfAbsent(planet.getId(), new ArrayList<>());
    }

    private void addBidirectionalRoute(String sourceId, String targetId, double distanceMkm,
                                       double interference, double hazardMsv, double fuelTons) {
        adjacencyList.get(sourceId).add(new SpaceRouteEdge(sourceId, targetId, distanceMkm, interference, hazardMsv, fuelTons));
        adjacencyList.get(targetId).add(new SpaceRouteEdge(targetId, sourceId, distanceMkm, interference, hazardMsv, fuelTons));
    }

    public List<PlanetNode> getAllPlanets() {
        return new ArrayList<>(planets.values());
    }

    public List<SpaceRouteEdge> getAllUniqueEdges() {
        List<SpaceRouteEdge> uniqueEdges = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (List<SpaceRouteEdge> edgeList : adjacencyList.values()) {
            for (SpaceRouteEdge edge : edgeList) {
                String key = edge.getSourcePlanetId().compareTo(edge.getTargetPlanetId()) < 0
                        ? edge.getSourcePlanetId() + "-" + edge.getTargetPlanetId()
                        : edge.getTargetPlanetId() + "-" + edge.getSourcePlanetId();
                if (!seen.contains(key)) {
                    seen.add(key);
                    uniqueEdges.add(edge);
                }
            }
        }
        return uniqueEdges;
    }

    // =========================================================================
    // 1. TIME-DEPENDENT ORBITAL GEOMETRY & SOLAR CONJUNCTION CHECK
    // =========================================================================
    private double[] getLiveOrbitalPosition(PlanetNode p, double simTime) {
        double angle = p.getInitialAngle() + (simTime * p.getOrbitSpeed());
        double x = Math.cos(angle) * p.getOrbitRadius();
        double y = Math.sin(angle) * p.getOrbitRadius();
        return new double[]{x, y};
    }

    private double computeDynamicDistanceMkm(SpaceRouteEdge edge, double simTime) {
        PlanetNode a = planets.get(edge.getSourcePlanetId());
        PlanetNode b = planets.get(edge.getTargetPlanetId());
        if (a == null || b == null) return edge.getBaseDistanceMkm();

        double[] posA = getLiveOrbitalPosition(a, simTime);
        double[] posB = getLiveOrbitalPosition(b, simTime);

        double visualDist = Math.hypot(posA[0] - posB[0], posA[1] - posB[1]);
        double radialDiff = Math.max(15.0, Math.abs(a.getOrbitRadius() - b.getOrbitRadius()));
        double orbitalFactor = 0.75 + 0.55 * Math.min(2.0, visualDist / radialDiff);

        return Math.round(edge.getBaseDistanceMkm() * orbitalFactor * 10.0) / 10.0;
    }

    private boolean isSolarConjunctionBlocked(PlanetNode a, PlanetNode b, double simTime) {
        double[] p1 = getLiveOrbitalPosition(a, simTime);
        double[] p2 = getLiveOrbitalPosition(b, simTime);

        // Closest distance from line segment P1-P2 to the Sun at (0,0)
        double dx = p2[0] - p1[0];
        double dy = p2[1] - p1[1];
        double lenSq = dx * dx + dy * dy;
        if (lenSq == 0) return false;

        double t = Math.max(0, Math.min(1, (-p1[0] * dx - p1[1] * dy) / lenSq));
        double closestX = p1[0] + t * dx;
        double closestY = p1[1] + t * dy;
        double distToSun = Math.hypot(closestX, closestY);

        return distToSun < 34.0; // Within solar corona interference zone
    }

    // =========================================================================
    // 2. FUEL-CONSTRAINED STATE-SPACE DIJKSTRA PATHFINDING
    // =========================================================================
    public Map<String, Object> findOptimalRoute(String startId, String destId, String mode,
                                                double maxFuelTons, double shieldBonus, double simTime) {
        if (!planets.containsKey(startId) || !planets.containsKey(destId)) {
            return Collections.singletonMap("error", "Invalid station IDs.");
        }

        // Discretize fuel into 10-ton buckets for state-space Dijkstra: state = "planetId:fuelBucket"
        int maxBucket = (int) Math.max(10, Math.round(maxFuelTons / 10.0));
        Map<String, Double> bestCost = new HashMap<>();
        Map<String, String> parentState = new HashMap<>();
        Map<String, Boolean> refueledAtState = new HashMap<>();

        PriorityQueue<StateNode> pq = new PriorityQueue<>(Comparator.comparingDouble(s -> s.cost));
        String startState = startId + ":" + maxBucket;
        bestCost.put(startState, 0.0);
        pq.add(new StateNode(startId, maxBucket, 0.0));

        String bestDestState = null;
        double lowestDestCost = Double.MAX_VALUE;

        while (!pq.isEmpty()) {
            StateNode curr = pq.poll();
            String currKey = curr.planetId + ":" + curr.fuelBucket;

            if (curr.cost > bestCost.getOrDefault(currKey, Double.MAX_VALUE)) continue;

            if (curr.planetId.equals(destId)) {
                if (curr.cost < lowestDestCost) {
                    lowestDestCost = curr.cost;
                    bestDestState = currKey;
                }
                break;
            }

            PlanetNode currentPlanet = planets.get(curr.planetId);

            // Option A: Refuel if station has a depot and tank is not full
            if (currentPlanet.isHasRefuelDepot() && curr.fuelBucket < maxBucket) {
                double tonsNeeded = (maxBucket - curr.fuelBucket) * 10.0;
                double refuelDollarCost = tonsNeeded * currentPlanet.getRefuelCostPerTon();
                double refuelPenalty = "FASTEST".equalsIgnoreCase(mode) ? 120.0 : (refuelDollarCost * 0.01);
                String refueledKey = curr.planetId + ":" + maxBucket;
                double newCost = curr.cost + refuelPenalty;

                if (newCost < bestCost.getOrDefault(refueledKey, Double.MAX_VALUE)) {
                    bestCost.put(refueledKey, newCost);
                    parentState.put(refueledKey, currKey);
                    refueledAtState.put(refueledKey, true);
                    pq.add(new StateNode(curr.planetId, maxBucket, newCost));
                }
            }

            // Option B: Traverse outgoing space corridors
            for (SpaceRouteEdge edge : adjacencyList.getOrDefault(curr.planetId, Collections.emptyList())) {
                PlanetNode nextPlanet = planets.get(edge.getTargetPlanetId());
                double dynamicDist = computeDynamicDistanceMkm(edge, simTime);
                double distRatio = dynamicDist / edge.getBaseDistanceMkm();
                double requiredFuel = edge.getBaseFuelTons() * distRatio;
                int fuelBucketsNeeded = (int) Math.ceil(requiredFuel / 10.0);

                if (curr.fuelBucket < fuelBucketsNeeded) {
                    continue; // Insufficient fuel for this jump without refueling first
                }

                boolean solarBlocked = isSolarConjunctionBlocked(currentPlanet, nextPlanet, simTime);
                double effectiveNoise = Math.min(0.99, edge.getSignalInterference() + (solarBlocked ? 0.45 : 0.0) + (edge.isDisrupted() ? 0.50 : 0.0));
                double effectiveHazard = Math.max(1.0, (edge.getRadiationHazardMsv() * (1.0 - shieldBonus)) + (solarBlocked ? 40.0 : 0.0) + (edge.isDisrupted() ? 85.0 : 0.0));

                double edgeWeight;
                if ("FASTEST".equalsIgnoreCase(mode)) {
                    edgeWeight = dynamicDist + (edge.isDisrupted() ? 2000.0 : 0.0);
                } else if ("SAFEST".equalsIgnoreCase(mode)) {
                    edgeWeight = (effectiveHazard * 15.0) + (effectiveNoise * 400.0) + (dynamicDist * 0.15);
                } else {
                    edgeWeight = dynamicDist * (1.0 + effectiveNoise) + (effectiveHazard * 4.5);
                }

                int nextBucket = curr.fuelBucket - fuelBucketsNeeded;
                String nextKey = edge.getTargetPlanetId() + ":" + nextBucket;
                double newCost = curr.cost + edgeWeight;

                if (newCost < bestCost.getOrDefault(nextKey, Double.MAX_VALUE)) {
                    bestCost.put(nextKey, newCost);
                    parentState.put(nextKey, currKey);
                    refueledAtState.put(nextKey, false);
                    pq.add(new StateNode(edge.getTargetPlanetId(), nextBucket, newCost));
                }
            }
        }

        Map<String, Object> response = new HashMap<>();
        if (bestDestState == null) {
            response.put("path", Collections.emptyList());
            response.put("error", "Insufficient spacecraft fuel tank capacity (" + maxFuelTons + " t) to bridge between refueling depots.");
            return response;
        }

        // Reconstruct path and refueling stops using LIFO traversal
        List<PlanetNode> path = new ArrayList<>();
        List<String> refuelStops = new ArrayList<>();
        String trace = bestDestState;
        String lastAddedPlanetId = "";

        while (trace != null) {
            String pId = trace.split(":")[0];
            if (Boolean.TRUE.equals(refueledAtState.get(trace))) {
                refuelStops.add(0, planets.get(pId).getName());
            }
            if (!pId.equals(lastAddedPlanetId)) {
                path.add(0, planets.get(pId));
                lastAddedPlanetId = pId;
            }
            trace = parentState.get(trace);
        }

        // Aggregate realistic aerospace telemetry along the chosen path
        double totalDistanceMkm = 0.0;
        double totalFuelTons = 0.0;
        double totalHazardMsv = 0.0;
        double peakNoise = 0.0;
        double totalCostUsd = 0.0;
        int solarWarnings = 0;

        for (int i = 0; i < path.size() - 1; i++) {
            PlanetNode u = path.get(i);
            PlanetNode v = path.get(i + 1);
            for (SpaceRouteEdge edge : adjacencyList.get(u.getId())) {
                if (edge.getTargetPlanetId().equals(v.getId())) {
                    double dynDist = computeDynamicDistanceMkm(edge, simTime);
                    double ratio = dynDist / edge.getBaseDistanceMkm();
                    double segFuel = edge.getBaseFuelTons() * ratio;
                    boolean solarBlocked = isSolarConjunctionBlocked(u, v, simTime);
                    if (solarBlocked) solarWarnings++;

                    double segNoise = Math.min(0.99, edge.getSignalInterference() + (solarBlocked ? 0.45 : 0.0) + (edge.isDisrupted() ? 0.50 : 0.0));
                    double segHazard = Math.max(1.0, (edge.getRadiationHazardMsv() * (1.0 - shieldBonus)) + (solarBlocked ? 40.0 : 0.0) + (edge.isDisrupted() ? 85.0 : 0.0));

                    totalDistanceMkm += dynDist;
                    totalFuelTons += segFuel;
                    totalHazardMsv += segHazard;
                    peakNoise = Math.max(peakNoise, segNoise);

                    double fuelPrice = u.isHasRefuelDepot() ? u.getRefuelCostPerTon() : 480.0;
                    totalCostUsd += (segFuel * fuelPrice) + (dynDist * 18.5);
                    break;
                }
            }
        }

        // Average cruise velocity ~ 18.5 Mkm/day (~214 km/s fusion torch drive)
        double totalDays = totalDistanceMkm / 18.5;
        int days = (int) totalDays;
        int hours = (int) Math.round((totalDays - days) * 24);
        String durationFormatted = days + "d " + hours + "h";

        // Light-speed signal latency (1 Mkm = 3.335 seconds)
        double signalLatencyMinutes = (totalDistanceMkm * 3.335) / 60.0;

        totalDistanceMkm = Math.round(totalDistanceMkm * 10.0) / 10.0;
        totalFuelTons = Math.round(totalFuelTons * 10.0) / 10.0;
        totalHazardMsv = Math.round(totalHazardMsv * 10.0) / 10.0;
        totalCostUsd = Math.round(totalCostUsd * 100.0) / 100.0;

        // Log mission automatically into Binary Search Tree (MissionLogTree)
        String missionId = "MSN-" + (++missionCounter);
        missionLogTree.insert(new MissionRecord(
                missionId,
                path.get(0).getName(),
                path.get(path.size() - 1).getName(),
                mode,
                totalDistanceMkm,
                totalFuelTons,
                totalCostUsd
        ));

        response.put("missionId", missionId);
        response.put("path", path);
        response.put("refuelStops", refuelStops);
        response.put("totalDistance", totalDistanceMkm);
        response.put("totalFuelTons", totalFuelTons);
        response.put("totalInterference", peakNoise);
        response.put("totalHazard", totalHazardMsv);
        response.put("calculatedCost", totalCostUsd);
        response.put("travelDuration", durationFormatted);
        response.put("signalLatencyMin", Math.round(signalLatencyMinutes * 10.0) / 10.0);
        response.put("solarConjunctionCount", solarWarnings);
        response.put("routeType", mode);

        return response;
    }

    // =========================================================================
    // 3. MULTI-STOP CARGO TOUR (GREEDY NEAREST-NEIGHBOR TSP + DIJKSTRA)
    // =========================================================================
    public Map<String, Object> calculateMultiStopTour(List<String> waypoints, String mode,
                                                      double maxFuelTons, double shieldBonus, double simTime) {
        if (waypoints == null || waypoints.size() < 2) {
            return Collections.singletonMap("error", "Select at least 2 stations for a multi-stop tour.");
        }

        String startId = waypoints.get(0);
        Set<String> unvisited = new LinkedHashSet<>(waypoints.subList(1, waypoints.size()));
        List<String> orderedTour = new ArrayList<>();
        orderedTour.add(startId);

        String current = startId;
        while (!unvisited.isEmpty()) {
            String bestNext = null;
            double bestLegDist = Double.MAX_VALUE;

            for (String candidate : unvisited) {
                Map<String, Object> leg = findOptimalRoute(current, candidate, mode, maxFuelTons, shieldBonus, simTime);
                if (leg.containsKey("totalDistance")) {
                    double d = (double) leg.get("totalDistance");
                    if (d < bestLegDist) {
                        bestLegDist = d;
                        bestNext = candidate;
                    }
                }
            }
            if (bestNext == null) {
                bestNext = unvisited.iterator().next();
            }
            orderedTour.add(bestNext);
            unvisited.remove(bestNext);
            current = bestNext;
        }

        List<PlanetNode> combinedPath = new ArrayList<>();
        List<String> allRefuelStops = new ArrayList<>();
        double totalDist = 0, totalFuel = 0, totalHazard = 0, totalCost = 0, peakNoise = 0, totalLatency = 0;

        for (int i = 0; i < orderedTour.size() - 1; i++) {
            Map<String, Object> leg = findOptimalRoute(orderedTour.get(i), orderedTour.get(i + 1), mode, maxFuelTons, shieldBonus, simTime);
            if (leg.containsKey("error")) return leg;

            @SuppressWarnings("unchecked")
            List<PlanetNode> legPath = (List<PlanetNode>) leg.get("path");
            if (i == 0) {
                combinedPath.addAll(legPath);
            } else if (!legPath.isEmpty()) {
                combinedPath.addAll(legPath.subList(1, legPath.size()));
            }

            @SuppressWarnings("unchecked")
            List<String> legRefuels = (List<String>) leg.get("refuelStops");
            allRefuelStops.addAll(legRefuels);

            totalDist += (double) leg.get("totalDistance");
            totalFuel += (double) leg.get("totalFuelTons");
            totalHazard += (double) leg.get("totalHazard");
            totalCost += (double) leg.get("calculatedCost");
            totalLatency += (double) leg.get("signalLatencyMin");
            peakNoise = Math.max(peakNoise, (double) leg.get("totalInterference"));
        }

        double totalDays = totalDist / 18.5;
        int days = (int) totalDays;
        int hours = (int) Math.round((totalDays - days) * 24);

        Map<String, Object> tourResult = new HashMap<>();
        tourResult.put("path", combinedPath);
        tourResult.put("orderedWaypoints", orderedTour);
        tourResult.put("refuelStops", allRefuelStops);
        tourResult.put("totalDistance", Math.round(totalDist * 10.0) / 10.0);
        tourResult.put("totalFuelTons", Math.round(totalFuel * 10.0) / 10.0);
        tourResult.put("totalInterference", peakNoise);
        tourResult.put("totalHazard", Math.round(totalHazard * 10.0) / 10.0);
        tourResult.put("calculatedCost", Math.round(totalCost * 100.0) / 100.0);
        tourResult.put("travelDuration", days + "d " + hours + "h");
        tourResult.put("signalLatencyMin", Math.round(totalLatency * 10.0) / 10.0);
        tourResult.put("routeType", "MULTI-STOP CARGO TOUR");

        return tourResult;
    }

    // =========================================================================
    // 4. KRUSKAL'S MINIMUM SPANNING TREE (DISJOINT SET UNION) FOR RELAY MESH
    // =========================================================================
    public Map<String, Object> computeCommunicationMST(double simTime) {
        List<SpaceRouteEdge> allEdges = getAllUniqueEdges();
        allEdges.sort(Comparator.comparingDouble(e ->
                (e.getSignalInterference() * 1000.0) + computeDynamicDistanceMkm(e, simTime)
        ));

        Map<String, String> parent = new HashMap<>();
        for (String id : planets.keySet()) {
            parent.put(id, id);
        }

        List mstLinks = new ArrayList<>();
        double totalBackboneDistance = 0.0;
        double avgInterference = 0.0;

        for (SpaceRouteEdge edge : allEdges) {
            String rootA = findSet(parent, edge.getSourcePlanetId());
            String rootB = findSet(parent, edge.getTargetPlanetId());

            if (!rootA.equals(rootB)) {
                parent.put(rootA, rootB);
                double dynDist = computeDynamicDistanceMkm(edge, simTime);
                totalBackboneDistance += dynDist;
                avgInterference += edge.getSignalInterference();

                Map<String, Object> link = new HashMap<>();
                link.put("sourceId", edge.getSourcePlanetId());
                link.put("targetId", edge.getTargetPlanetId());
                link.put("distanceMkm", dynDist);
                link.put("interference", edge.getSignalInterference());
                mstLinks.add(link);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("mstEdges", mstLinks);
        result.put("totalLinks", mstLinks.size());
        result.put("totalBackboneDistanceMkm", Math.round(totalBackboneDistance * 10.0) / 10.0);
        result.put("averageNoisePercent", mstLinks.isEmpty() ? 0 : Math.round((avgInterference / mstLinks.size()) * 1000.0) / 10.0);
        return result;
    }

    private String findSet(Map<String, String> parent, String node) {
        if (!parent.get(node).equals(node)) {
            parent.put(node, findSet(parent, parent.get(node)));
        }
        return parent.get(node);
    }

    // =========================================================================
    // 5. LIVE SPACE WEATHER HAZARDS & LIFO UNDO STACK
    // =========================================================================
    public Map<String, Object> triggerSpaceWeatherHazard(String sourceId, String targetId, String hazardType) {
        boolean updated = false;
        boolean prevState = false;
        String prevReason = "Nominal";

        for (SpaceRouteEdge edge : adjacencyList.getOrDefault(sourceId, Collections.emptyList())) {
            if (edge.getTargetPlanetId().equals(targetId)) {
                prevState = edge.isDisrupted();
                prevReason = edge.getDisruptionReason();
                edge.setDisrupted(true);
                edge.setDisruptionReason(hazardType);
                updated = true;
            }
        }
        for (SpaceRouteEdge edge : adjacencyList.getOrDefault(targetId, Collections.emptyList())) {
            if (edge.getTargetPlanetId().equals(sourceId)) {
                edge.setDisrupted(true);
                edge.setDisruptionReason(hazardType);
            }
        }

        if (updated) {
            actionStack.push(new HazardEvent(sourceId, targetId, hazardType, prevState, prevReason));
        }

        Map<String, Object> res = new HashMap<>();
        res.put("success", updated);
        res.put("undoStackSize", actionStack.size());
        res.put("edges", getAllUniqueEdges());
        return res;
    }

    public Map<String, Object> undoLastHazard() {
        Map<String, Object> res = new HashMap<>();
        if (actionStack.isEmpty()) {
            res.put("success", false);
            res.put("message", "No space weather events on stack to undo.");
            res.put("undoStackSize", 0);
            return res;
        }

        HazardEvent last = actionStack.pop();
        for (SpaceRouteEdge edge : adjacencyList.getOrDefault(last.getSourceId(), Collections.emptyList())) {
            if (edge.getTargetPlanetId().equals(last.getTargetId())) {
                edge.setDisrupted(last.isPreviousDisruptedState());
                edge.setDisruptionReason(last.getPreviousReason());
            }
        }
        for (SpaceRouteEdge edge : adjacencyList.getOrDefault(last.getTargetId(), Collections.emptyList())) {
            if (edge.getTargetPlanetId().equals(last.getSourceId())) {
                edge.setDisrupted(last.isPreviousDisruptedState());
                edge.setDisruptionReason(last.getPreviousReason());
            }
        }

        res.put("success", true);
        res.put("revertedHazard", last.getHazardType());
        res.put("corridor", last.getSourceId() + " <-> " + last.getTargetId());
        res.put("undoStackSize", actionStack.size());
        res.put("edges", getAllUniqueEdges());
        return res;
    }

    public List<MissionRecord> getMissionLeaderboard() {
        return missionLogTree.getSortedLeaderboard();
    }

    private static class StateNode {
        String planetId;
        int fuelBucket;
        double cost;

        StateNode(String planetId, int fuelBucket, double cost) {
            this.planetId = planetId;
            this.fuelBucket = fuelBucket;
            this.cost = cost;
        }
    }
}