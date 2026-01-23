import * as mqtt from "mqtt";
import axios from "axios";

const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";

console.log("[EXECUTOR] Avvio servizio...");

async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const res = await axios.get(CONFIG_SERVICE_URL);
      return res.data;
    } catch (error) {
      attempts++;
      console.warn(`⚠️ [EXECUTOR] Waiting for Config... (${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startExecutor() {
  const config = await fetchConfigWithRetry();
  const inputTopic = config.internal_topics.plan;

  // Mappa rapida ID -> TOPIC
  const actuatorMap = new Map<string, string>();
  config.devices.actuators.forEach((a: any) => {
    actuatorMap.set(a.id, a.topic);
  });

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [EXECUTOR] Connesso.");
    client.subscribe(inputTopic);
  });

  client.on("message", (topic, message) => {
    try {
      const plan = JSON.parse(message.toString());
      const targetTopic = actuatorMap.get(plan.target);

      if (targetTopic) {
        const payload = JSON.stringify({
          command: plan.action,
          timestamp: new Date().toISOString(),
        });

        console.log(`🚀 [EXECUTOR] ${plan.action} -> ${targetTopic}`);
        client.publish(targetTopic, payload);
      } else {
        console.error(`❌ Actuator ID non trovato: ${plan.target}`);
      }
    } catch (e) {
      console.error(e);
    }
  });
}

startExecutor();
