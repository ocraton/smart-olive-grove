# Smart Olive Grove Manager (SOGM)

**Student:** Marco Spada (ID: 308887)  
**Course:** Software Engineering for Autonomous Systems

## Project Overview

This project implements an autonomic system for managing an olive grove using the **MAPE-K** loop architecture. The system is designed as a Distributed Microservices Architecture, where the Autonomic Manager is decomposed into four independent containerized services (Monitor, Analyzer, Planner, Executor) communicating via MQTT.

## Architecture

The system follows an **External Approach** with the following stack:

- **Managed Resource:** A Node.js Simulator (Digital Twin of the grove) located in `managed-resource/`.
- **Communication:** MQTT (Eclipse Mosquitto).
- **Monitoring & Knowledge:** Telegraf + InfluxDB.
- **Visualization:** Grafana.
- **Autonomic Manager:** Decomposed into 4 Microservices (Node.js/TypeScript running in Docker):
  - **Monitor:** Collects and sanitizes sensor data.
  - **Analyzer:** Detects symptoms based on thresholds and historical knowledge (InfluxDB).
  - **Planner:** Decisions making and conflict resolution (Safety vs Liveness).
  - **Executor:** Translates plans into specific actuator commands.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- [Node.js](https://nodejs.org/) (v18 or higher) installed.

## How to Run the System

### 1. Start the Infrastructure & Autonomic Manager (Docker)

Open a terminal in the project root and run:

```bash
docker-compose up --build
```

This command starts all infrastructure services (Mosquitto, InfluxDB, Grafana) AND the 4 Autonomic Manager microservices (Monitor, Analyzer, Planner, Executor).

### 2. Start the Managed Resource (Simulator)

Open a **new** terminal window in the project root. First, install dependencies (only the first time):

```bash
npm install
```

Then, run the simulator (located in the new folder):

```bash
npx ts-node managed-resource/simulator.ts
```

### 3. Verify System Behavior (Grafana)

1. Open [http://localhost:3000](http://localhost:3000) (User/Pass: `admin`/`admin`).
2. Go to **Explore** → Select `influxdb_smart_olive_grove`.
3. Query metrics like `temperature`, `humidity`, or `trap_count` to visualize the system state.

## 🧪 Testing Scenarios

To verify the logic, you can manually adjust the physics in `managed-resource/simulator.ts` to trigger specific scenarios.

### Scenario A: Hydration Maintenance (Reactive)

**Goal:** Detect low humidity (< 30%) and activate the Drip Valve.

**How to test:**

1. Open `managed-resource/simulator.ts`.
2. Set starting humidity to a low value:

```typescript
let currentHumidity = 20.0;
```

**Result:** The Analyzer detects `DROUGHT_DETECTED`, the Planner decides `IRRIGATE`, and the Executor sends `ON` to `drip_valve`.

### Scenario B: Pest Control with Constraints (Conflict Resolution)

**Goal:** Treat infestation (> 50 pests) ONLY if wind is safe (< 15 km/h).

**How to test:**

1. Open `managed-resource/simulator.ts`.
2. Force high pest count:

```typescript
let currentTrapCount = 60;
```

**Result 1 (High Wind):** If wind > 15, the Planner logs: `✋ CONFLITTO: Infestazione ma Vento Alto. POSTICIPO.`

**Result 2 (Low Wind):** If you force low wind (`currentWindSpeed = 5;`), the Planner logs: `💡 Decisione: Attivare Nebulizzatore` and sends `ON`.

### Scenario C: Frost Protection (Predictive / Knowledge-Based)

**Goal:** Predict freezing based on temperature drop rate (> 2°C/h) using historical data from InfluxDB.

**How to test:**

1. Open `managed-resource/simulator.ts`.
2. Force a rapid temperature drop inside `simulationLoop`:

```typescript
// currentTemp += (Math.random() - 0.5); // Comment this
currentTemp -= 0.5; // Force rapid drop

let currentTemp = 10.0; // Start from lower temperature
```

**Result:** When Temp drops below 3°C, the Analyzer queries InfluxDB, detects `FROST_RISK_PREDICTED`, and the Planner activates `antifrost_valve` BEFORE 0°C is reached.