package com.startrace.dsa;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class MissionLogTree {

    public static class MissionRecord {
        private final String missionId;
        private final String originName;
        private final String destinationName;
        private final String mode;
        private final double totalDistanceMkm;
        private final double totalFuelTons;
        private final double totalCostUsd;
        private final String timestamp;

        public MissionRecord(String missionId, String originName, String destinationName, String mode,
                             double totalDistanceMkm, double totalFuelTons, double totalCostUsd) {
            this.missionId = missionId;
            this.originName = originName;
            this.destinationName = destinationName;
            this.mode = mode;
            this.totalDistanceMkm = totalDistanceMkm;
            this.totalFuelTons = totalFuelTons;
            this.totalCostUsd = totalCostUsd;
            this.timestamp = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        }

        public String getMissionId() { return missionId; }
        public String getOriginName() { return originName; }
        public String getDestinationName() { return destinationName; }
        public String getMode() { return mode; }
        public double getTotalDistanceMkm() { return totalDistanceMkm; }
        public double getTotalFuelTons() { return totalFuelTons; }
        public double getTotalCostUsd() { return totalCostUsd; }
        public String getTimestamp() { return timestamp; }
    }

    private static class TreeNode {
        MissionRecord record;
        TreeNode left;
        TreeNode right;

        TreeNode(MissionRecord record) {
            this.record = record;
        }
    }

    private TreeNode root;
    private int size = 0;

    public synchronized void insert(MissionRecord record) {
        root = insertRecursive(root, record);
        size++;
    }

    private TreeNode insertRecursive(TreeNode current, MissionRecord record) {
        if (current == null) {
            return new TreeNode(record);
        }
        // Sort ascending by mission budget ($) so most cost-efficient missions appear first
        if (record.getTotalCostUsd() < current.record.getTotalCostUsd()) {
            current.left = insertRecursive(current.left, record);
        } else {
            current.right = insertRecursive(current.right, record);
        }
        return current;
    }

    // In-Order Traversal: Returns missions sorted from lowest cost ($) to highest cost ($)
    public synchronized List<MissionRecord> getSortedLeaderboard() {
        List<MissionRecord> sortedList = new ArrayList<>();
        inOrderTraversal(root, sortedList);
        return sortedList;
    }

    private void inOrderTraversal(TreeNode node, List<MissionRecord> result) {
        if (node == null) return;
        inOrderTraversal(node.left, result);
        result.add(node.record);
        inOrderTraversal(node.right, result);
    }

    public synchronized void clear() {
        root = null;
        size = 0;
    }

    public int getSize() {
        return size;
    }
}
