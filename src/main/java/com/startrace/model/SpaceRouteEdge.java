package com.startrace.model;

public class SpaceRouteEdge {
    private String sourcePlanetId;
    private String targetPlanetId;
    private double baseDistanceMkm;      // Base distance in Million Kilometers (Mkm)
    private double signalInterference;   // 0.0 to 1.0 (0% to 100% signal noise)
    private double radiationHazardMsv;   // Radiation exposure in Millisieverts (mSv)
    private double baseFuelTons;         // Propellant required in Metric Tons (t)
    private boolean disrupted;           // True if hit by a live Solar Flare or Debris Storm
    private String disruptionReason;     // e.g., "Nominal", "Class-X Solar Flare", "Debris Storm"

    public SpaceRouteEdge() {}

    public SpaceRouteEdge(String sourcePlanetId, String targetPlanetId, double baseDistanceMkm,
                          double signalInterference, double radiationHazardMsv, double baseFuelTons) {
        this.sourcePlanetId = sourcePlanetId;
        this.targetPlanetId = targetPlanetId;
        this.baseDistanceMkm = baseDistanceMkm;
        this.signalInterference = signalInterference;
        this.radiationHazardMsv = radiationHazardMsv;
        this.baseFuelTons = baseFuelTons;
        this.disrupted = false;
        this.disruptionReason = "Nominal";
    }

    public String getSourcePlanetId() { return sourcePlanetId; }
    public void setSourcePlanetId(String sourcePlanetId) { this.sourcePlanetId = sourcePlanetId; }

    public String getTargetPlanetId() { return targetPlanetId; }
    public void setTargetPlanetId(String targetPlanetId) { this.targetPlanetId = targetPlanetId; }

    public double getBaseDistanceMkm() { return baseDistanceMkm; }
    public void setBaseDistanceMkm(double baseDistanceMkm) { this.baseDistanceMkm = baseDistanceMkm; }

    public double getSignalInterference() { return signalInterference; }
    public void setSignalInterference(double signalInterference) { this.signalInterference = signalInterference; }

    public double getRadiationHazardMsv() { return radiationHazardMsv; }
    public void setRadiationHazardMsv(double radiationHazardMsv) { this.radiationHazardMsv = radiationHazardMsv; }

    public double getBaseFuelTons() { return baseFuelTons; }
    public void setBaseFuelTons(double baseFuelTons) { this.baseFuelTons = baseFuelTons; }

    public boolean isDisrupted() { return disrupted; }
    public void setDisrupted(boolean disrupted) { this.disrupted = disrupted; }

    public String getDisruptionReason() { return disruptionReason; }
    public void setDisruptionReason(String disruptionReason) { this.disruptionReason = disruptionReason; }
}