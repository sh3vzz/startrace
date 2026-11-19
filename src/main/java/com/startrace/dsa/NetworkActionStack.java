package com.startrace.dsa;

import java.util.EmptyStackException;

public class NetworkActionStack {

    public static class HazardEvent {
        private final String sourceId;
        private final String targetId;
        private final String hazardType;
        private final boolean previousDisruptedState;
        private final String previousReason;

        public HazardEvent(String sourceId, String targetId, String hazardType,
                           boolean previousDisruptedState, String previousReason) {
            this.sourceId = sourceId;
            this.targetId = targetId;
            this.hazardType = hazardType;
            this.previousDisruptedState = previousDisruptedState;
            this.previousReason = previousReason;
        }

        public String getSourceId() { return sourceId; }
        public String getTargetId() { return targetId; }
        public String getHazardType() { return hazardType; }
        public boolean isPreviousDisruptedState() { return previousDisruptedState; }
        public String getPreviousReason() { return previousReason; }
    }

    private static class StackNode {
        HazardEvent data;
        StackNode next;

        StackNode(HazardEvent data, StackNode next) {
            this.data = data;
            this.next = next;
        }
    }

    private StackNode top;
    private int count = 0;

    // O(1) Push onto top of LIFO stack
    public synchronized void push(HazardEvent event) {
        top = new StackNode(event, top);
        count++;
    }

    // O(1) Pop most recent event from top of LIFO stack
    public synchronized HazardEvent pop() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        HazardEvent event = top.data;
        top = top.next;
        count--;
        return event;
    }

    public synchronized HazardEvent peek() {
        if (isEmpty()) return null;
        return top.data;
    }

    public synchronized boolean isEmpty() {
        return top == null;
    }

    public synchronized int size() {
        return count;
    }

    public synchronized void clear() {
        top = null;
        count = 0;
    }
}
