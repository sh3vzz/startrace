package com.startrace.dto;

import com.startrace.model.PlanetNode;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RouteResponseDTO {
    private List<PlanetNode> path;
    private double totalDistance;
    private double totalInterference;
    private double totalHazard;
    private double calculatedCost;
    private String routeType; // e.g., "FASTEST", "SAFEST", "BALANCED"
}
