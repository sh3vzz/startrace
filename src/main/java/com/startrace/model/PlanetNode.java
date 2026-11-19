package com.startrace.model;

public class PlanetNode {
    private String id;
    private String name;
    private String sector;           // "INNER", "BELT", or "OUTER"
    private double xCoordinate;
    private double yCoordinate;
    private double orbitRadius;      // Visual & relative orbital distance from Sun
    private double orbitSpeed;       // Angular speed around the Sun
    private double initialAngle;     // Starting orbital angle in radians
    private String color;
    private boolean hasRefuelDepot;  // True if spacecraft can refuel propellant here
    private double refuelCostPerTon; // Cost in $ per metric ton of fuel
    private String atmosphere;
    private String description;

    public PlanetNode() {}

    public PlanetNode(String id, String name, String sector, double xCoordinate, double yCoordinate,
                      double orbitRadius, double orbitSpeed, double initialAngle, String color,
                      boolean hasRefuelDepot, double refuelCostPerTon, String atmosphere, String description) {
        this.id = id;
        this.name = name;
        this.sector = sector;
        this.xCoordinate = xCoordinate;
        this.yCoordinate = yCoordinate;
        this.orbitRadius = orbitRadius;
        this.orbitSpeed = orbitSpeed;
        this.initialAngle = initialAngle;
        this.color = color;
        this.hasRefuelDepot = hasRefuelDepot;
        this.refuelCostPerTon = refuelCostPerTon;
        this.atmosphere = atmosphere;
        this.description = description;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSector() { return sector; }
    public void setSector(String sector) { this.sector = sector; }

    public double getXCoordinate() { return xCoordinate; }
    public void setXCoordinate(double xCoordinate) { this.xCoordinate = xCoordinate; }

    public double getYCoordinate() { return yCoordinate; }
    public void setYCoordinate(double yCoordinate) { this.yCoordinate = yCoordinate; }

    public double getOrbitRadius() { return orbitRadius; }
    public void setOrbitRadius(double orbitRadius) { this.orbitRadius = orbitRadius; }

    public double getOrbitSpeed() { return orbitSpeed; }
    public void setOrbitSpeed(double orbitSpeed) { this.orbitSpeed = orbitSpeed; }

    public double getInitialAngle() { return initialAngle; }
    public void setInitialAngle(double initialAngle) { this.initialAngle = initialAngle; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    public boolean isHasRefuelDepot() { return hasRefuelDepot; }
    public void setHasRefuelDepot(boolean hasRefuelDepot) { this.hasRefuelDepot = hasRefuelDepot; }

    public double getRefuelCostPerTon() { return refuelCostPerTon; }
    public void setRefuelCostPerTon(double refuelCostPerTon) { this.refuelCostPerTon = refuelCostPerTon; }

    public String getAtmosphere() { return atmosphere; }
    public void setAtmosphere(String atmosphere) { this.atmosphere = atmosphere; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}