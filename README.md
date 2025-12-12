Smart Olive Grove Manager (SOGM)
================================

**Student:** Marco Spada (ID: 308887)**Course:** Software Engineering for Autonomous Systems

Project Overview
----------------

This project implements an autonomic system for managing an olive grove using the **MAPE-K** loop architecture. It simulates IoT sensors/actuators via a Digital Twin and uses a centralized Autonomic Manager to handle hydration, pest control, and frost protection.

Architecture
------------

The system follows an **External Approach** with the following stack:

*   **Managed Resource:** A Node.js Simulator (Digital Twin of the grove).
    
*   **Communication:** MQTT (Eclipse Mosquitto).
    
*   **Monitoring & Knowledge:** Telegraf + InfluxDB.
    
*   **Visualization:** Grafana.
    
*   **Autonomic Manager:** Node.js/TypeScript (Analysis & Planning logic).
    

Prerequisites
-------------

*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
    
*   [Node.js](https://nodejs.org/) (v18 or higher) installed.
    

How to Run the System
---------------------

### 1\. Start the Infrastructure (Docker)

Open a terminal in the project root and run:

```bash
docker-compose up   
```

_Wait until all containers (Mosquitto, InfluxDB, Telegraf, Grafana) are running._

### 2\. Start the Managed Resource (Simulator)

Open a **new** terminal window in the project root.First, install dependencies (only the first time):

```bash
npm install   
```

Then, run the simulator:

```bash
npx ts-node simulator.ts   
```

### 3\. Start the Autonomic Manager

Open a **third** terminal window and run:

```bash
npx ts-node manager.ts   
```

### 4\. Verify System Behavior (Grafana)

1.  Open http://localhost:3000 (User/Pass: admin/admin).
    
2.  Go to **Explore** -> Select influxdb\_smart\_olive\_grove.
    
3.  Query metrics like temperature, humidity, or trap\_count to visualize the system state.
    

🧪 Testing Scenarios
--------------------

To verify the Autonomic Manager's logic, you can manually adjust the physics in simulator.ts to trigger specific scenarios.

### Scenario A: Hydration Maintenance (Reactive)

**Goal:** Detect low humidity (< 30%) and activate the Drip Valve.**How to test:**

1.  Open simulator.ts.
    
2.  TypeScriptlet currentHumidity = 20.0;
    
3.  **Result:** The Manager detects the issue and sends ON to drip\_valve. Humidity rises in the simulator logs.
    

### Scenario B: Pest Control with Constraints (Conflict Resolution)

**Goal:** Treat infestation (> 50 pests) ONLY if wind is safe (< 15 km/h).**How to test:**

1.  Open simulator.ts.
    
2.  TypeScriptlet currentTrapCount = 60;
    
3.  **Result 1 (High Wind):** If currentWindSpeed is > 15 (randomly generated), the Manager logs: ✋ Trattamento POSTICIPATO.
    
4.  **Result 2 (Low Wind):** If you force low wind (currentWindSpeed = 5;), the Manager logs: 🚀 Avvio trattamento and sends ON to nebulizer\_pump.
    

### Scenario C: Frost Protection (Predictive / Knowledge-Based)

**Goal:** Predict freezing based on temperature drop rate (> 2°C/h) using historical data from InfluxDB.**How to test:**

1.  Open simulator.ts.
    
2.  TypeScript// currentTemp += (Math.random() - 0.5); // Comment thiscurrentTemp -= 0.2; // Force rapid drop
    
3.  **Result:** When Temp drops below 3°C, the Manager queries InfluxDB, detects the steep trend, and activates antifrost\_valve BEFORE 0°C is reached.