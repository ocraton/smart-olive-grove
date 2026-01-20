import * as mqtt from "mqtt";
import axios from "axios";

// Configurazione Iniziale
const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";

// STATO FISICO
let currentTemp = 15.0;
let currentHumidity = 25.0;
let currentWindSpeed = 10.0;
let currentTrapCount = 0;

let isValveOpen = false;
let isNebulizerActive = false;

console.log(`🌱 Avvio Simulatore Oliveto...`);

// Funzione Helper per il Retry
async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const response = await axios.get(CONFIG_SERVICE_URL);
      console.log("📥 [SIMULATOR] Configurazione ricevuta!");
      return response.data.topics; // Ritorniamo i topic
    } catch (error) {
      attempts++;
      console.warn(
        `⚠️ [SIMULATOR] Config Service non raggiungibile (Tentativo ${attempts}). Riprovo tra 3s...`,
      );
      // Aspetta 3 secondi prima di riprovare (blocca l'esecuzione async)
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startSimulator() {
  // 1. SCARICA CONFIGURAZIONE (Con Retry Infinito)
  const topics = await fetchConfigWithRetry();

  // 2. CONNESSIONE MQTT
  // Se arriviamo qui, siamo sicuri di avere i topic
  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ Simulatore connesso a Mosquitto!");

    // Sottoscrizione usando i nomi dinamici
    client.subscribe(topics.actuator_valve);
    client.subscribe(topics.actuator_antifrost);
    client.subscribe(topics.actuator_nebulizer);

    // Avvio loop fisico
    setInterval(() => simulationLoop(client, topics), 5000);
  });

  client.on("message", (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      const command = payload.command;

      if (topic === topics.actuator_valve) {
        isValveOpen = command === "ON";
        console.log(`💧 [Sim] Valvola: ${isValveOpen ? "APERTA" : "CHIUSA"}`);
      } else if (topic === topics.actuator_nebulizer) {
        isNebulizerActive = command === "ON";
        console.log(
          `💨 [Sim] Nebulizzatore: ${isNebulizerActive ? "ATTIVO" : "SPENTO"}`,
        );
      } else if (topic === topics.actuator_antifrost) {
        console.log(`❄️ [Sim] Antibrina: ${command}`);
      }
    } catch (e) {
      console.error("Errore parsing comando attuatore");
    }
  });
}

function simulationLoop(client: mqtt.MqttClient, topics: any) {
  // 1. FISICA TEMPERATURA
  // currentTemp += Math.random() - 0.5;
  currentTemp -= 0.5; // Test Gelo

  // 2. FISICA UMIDITÀ
  if (isValveOpen) currentHumidity += 4.5;
  else currentHumidity -= 1.0;
  if (currentHumidity < 0) currentHumidity = 0;
  if (currentHumidity > 100) currentHumidity = 100;

  // 3. FISICA VENTO
  currentWindSpeed += (Math.random() - 0.5) * 5;
  if (currentWindSpeed < 0) currentWindSpeed = 0;

  // 4. FISICA MOSCHE
  if (isNebulizerActive) {
    currentTrapCount -= 10;
    if (currentTrapCount < 0) currentTrapCount = 0;
  } else {
    currentTrapCount += 5;
  }

  // Invio Dati
  const payload = {
    temperature: parseFloat(currentTemp.toFixed(2)),
    humidity: parseFloat(currentHumidity.toFixed(2)),
    wind_speed: parseFloat(currentWindSpeed.toFixed(2)),
    trap_count: Math.floor(currentTrapCount),
    timestamp: new Date().toISOString(),
  };

  client.publish(topics.sensor_weather, JSON.stringify(payload));

  console.log(
    `📡 [SENSORE] T:${payload.temperature} H:${payload.humidity} W:${payload.wind_speed} 🪰:${payload.trap_count}`,
  );
}

startSimulator();
