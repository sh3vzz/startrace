package com.startrace.controller;

import com.startrace.dsa.MissionLogTree.MissionRecord;
import com.startrace.model.PlanetNode;
import com.startrace.model.SpaceRouteEdge;
import com.startrace.service.GraphService;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class RouteController {

    private final GraphService graphService;

    public RouteController(GraphService graphService) {
        this.graphService = graphService;
    }

    @GetMapping("/planets")
    public List<PlanetNode> getAllPlanets() {
        return graphService.getAllPlanets();
    }

    @GetMapping("/edges")
    public List<SpaceRouteEdge> getAllEdges() {
        return graphService.getAllUniqueEdges();
    }

    @GetMapping("/route")
    public Map<String, Object> getOptimalRoute(
            @RequestParam String start,
            @RequestParam String destination,
            @RequestParam(defaultValue = "BALANCED") String mode,
            @RequestParam(defaultValue = "600.0") double maxFuelTons,
            @RequestParam(defaultValue = "0.0") double shieldBonus,
            @RequestParam(defaultValue = "0.0") double simTime) {
        return graphService.findOptimalRoute(start, destination, mode, maxFuelTons, shieldBonus, simTime);
    }

    @GetMapping("/tour")
    public Map<String, Object> getMultiStopTour(
            @RequestParam String waypoints,
            @RequestParam(defaultValue = "BALANCED") String mode,
            @RequestParam(defaultValue = "600.0") double maxFuelTons,
            @RequestParam(defaultValue = "0.0") double shieldBonus,
            @RequestParam(defaultValue = "0.0") double simTime) {
        List<String> stopList = Arrays.asList(waypoints.split(","));
        return graphService.calculateMultiStopTour(stopList, mode, maxFuelTons, shieldBonus, simTime);
    }

    @GetMapping("/mst")
    public Map<String, Object> getRelayBackboneMST(
            @RequestParam(defaultValue = "0.0") double simTime) {
        return graphService.computeCommunicationMST(simTime);
    }

    @PostMapping("/hazard/trigger")
    public Map<String, Object> triggerHazard(
            @RequestParam String source,
            @RequestParam String target,
            @RequestParam(defaultValue = "Class-X Solar Flare") String type) {
        return graphService.triggerSpaceWeatherHazard(source, target, type);
    }

    @PostMapping("/hazard/undo")
    public Map<String, Object> undoHazard() {
        return graphService.undoLastHazard();
    }

    @GetMapping("/leaderboard")
    public List<MissionRecord> getMissionLeaderboard() {
        return graphService.getMissionLeaderboard();
    }
}