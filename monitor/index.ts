import * as mqtt from "mqtt";
import axios from "axios";

const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";

console.log("[MONITOR] Avvio servizio...");

async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const res = await axios.get(CONFIG_SERVICE_URL);
      return res.data;
    } catch (error) {
      attempts++;
      console.warn(`⚠️ [MONITOR] Waiting for Config... (${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startMonitor() {
  const config = await fetchConfigWithRetry();
  const internalTopic = config.internal_topics.monitor;

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [MONITOR] Connesso.");

    // SOTTOSCRIZIONE DINAMICA A TUTTI I SENSORI
    config.devices.sensors.forEach((sensor: any) => {
      console.log(`👀 Monitoraggio sensore: ${sensor.id} (${sensor.topic})`);
      client.subscribe(sensor.topic);
    });
  });

  client.on("message", (topic, message) => {
    try {
      const rawData = JSON.parse(message.toString());

      // Arricchiamo il dato
      const processedData = {
        ...rawData,
        _monitor_timestamp: new Date().toISOString(),
        _source_topic: topic,
      };

      // Inoltro al canale interno unico
      client.publish(internalTopic, JSON.stringify(processedData));
    } catch (e) {
      console.error("Monitor Error", e);
    }
  });
}

startMonitor();
