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
      const response = await axios.get(CONFIG_SERVICE_URL);
      console.log("📥 [EXECUTOR] Configurazione ricevuta.");
      return response.data;
    } catch (error) {
      attempts++;
      console.warn(
        `⚠️ [EXECUTOR] Config Service non raggiungibile (Tentativo ${attempts}). Riprovo tra 3s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startExecutor() {
  // 1. Fetch Configuration ROBUSTA
  const config = await fetchConfigWithRetry();
  const topics = config.topics;

  // 2. Mappatura Logica -> Fisica (Dinamica)
  const ACTUATORS_MAP: { [key: string]: string } = {
    drip_valve: topics.actuator_valve,
    antifrost_valve: topics.actuator_antifrost,
    nebulizer_pump: topics.actuator_nebulizer,
  };

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [EXECUTOR] Connesso");
    client.subscribe(topics.internal_plan);
  });

  client.on("message", (topic, message) => {
    try {
      const plan = JSON.parse(message.toString());
      execute(client, plan, ACTUATORS_MAP);
    } catch (e) {
      console.error(e);
    }
  });
}

function execute(client: mqtt.MqttClient, plan: any, actuatorsMap: any) {
  const targetTopic = actuatorsMap[plan.target];

  if (targetTopic) {
    const commandPayload = JSON.stringify({
      command: plan.action,
      timestamp: new Date().toISOString(),
    });

    console.log(`🚀 [EXECUTOR] Esecuzione: ${plan.action} su ${targetTopic}`);
    client.publish(targetTopic, commandPayload);
  } else {
    console.error(
      `❌ [EXECUTOR] Attuatore sconosciuto nel piano: ${plan.target}`,
    );
  }
}

startExecutor();
