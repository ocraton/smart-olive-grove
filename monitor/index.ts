import * as mqtt from "mqtt";
import axios from "axios";

const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";

console.log("[MONITOR] Avvio servizio...");

// Helper per il Retry all'avvio
async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const response = await axios.get(CONFIG_SERVICE_URL);
      console.log("📥 [MONITOR] Configurazione ricevuta.");
      return response.data; // Ritorna tutto (topics + knowledge)
    } catch (error) {
      attempts++;
      console.warn(
        `⚠️ [MONITOR] Config Service non raggiungibile (Tentativo ${attempts}). Riprovo tra 3s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startMonitor() {
  // 1. Fetch Config con Retry
  const config = await fetchConfigWithRetry();
  const topics = config.topics;

  // 2. Connect MQTT
  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [MONITOR] Connesso al broker");
    client.subscribe(topics.sensor_weather);
  });

  client.on("message", (topic, message) => {
    if (topic === topics.sensor_weather) {
      try {
        const rawData = JSON.parse(message.toString());

        const cleanData = {
          humidity: rawData.humidity,
          temperature: rawData.temperature,
          wind_speed: rawData.wind_speed,
          trap_count: rawData.trap_count,
          timestamp: new Date().toISOString(),
        };

        console.log(`📡 [MONITOR] Inoltro dati a ${topics.internal_monitor}`);
        client.publish(topics.internal_monitor, JSON.stringify(cleanData));
      } catch (e) {
        console.error("❌ Errore parsing sensore", e);
      }
    }
  });
}

startMonitor();
