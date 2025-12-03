# Smart Olive Grove Manager (SOGM)

**Student:** Marco Spada (ID: 308887)
**Course:** Software Engineering for Autonomous Systems

## Project Overview
This project implements an autonomic system for managing an olive grove using the **MAPE-K** loop architecture. It simulates IoT sensors/actuators and uses a centralized Autonomic Manager to handle hydration, pest control, and frost protection.

## Architecture
The system follows an **External Approach** with the following stack:
* **Managed Resource:** A Node.js Simulator (simulates sensors/actuators).
* **Communication:** MQTT (Eclipse Mosquitto).
* **Monitoring & Knowledge:** Telegraf + InfluxDB.
* **Visualization:** Grafana.
* **Autonomic Manager:** Node.js/TypeScript (Analysis & Planning logic).

## Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
* [Node.js](https://nodejs.org/) (v18 or higher) installed.

## How to Run the System

### 1. Start the Infrastructure (Docker)
Open a terminal in the project root and run:
```bash
docker-compose up