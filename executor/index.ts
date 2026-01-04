import * as mqtt from "mqtt";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const TOPIC_INTERNAL_PLAN = "managed/plan/command"; // Input

// Mappa dei topic reali degli attuatori
const ACTUATORS: { [key: string]: string } = {
  drip_valve: "oliveto/actuators/drip_valve",
  antifrost_valve: "oliveto/actuators/antifrost_valve",
  nebulizer_pump: "oliveto/actuators/nebulizer_pump",
};

console.log("[EXECUTOR] Avvio servizio...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ [EXECUTOR] Connesso");
  client.subscribe(TOPIC_INTERNAL_PLAN);
});

client.on("message", (topic, message) => {
  try {
    const plan = JSON.parse(message.toString());
    execute(plan);
  } catch (e) {
    console.error(e);
  }
});

function execute(plan: any) {
  const targetTopic = ACTUATORS[plan.target];

  if (targetTopic) {
    const commandPayload = JSON.stringify({
      command: plan.action,
      timestamp: new Date().toISOString(),
    });

    console.log(`🚀 [EXECUTOR] Esecuzione: ${plan.action} su ${plan.target}`);
    client.publish(targetTopic, commandPayload);
  } else {
    console.error(`❌ [EXECUTOR] Attuatore sconosciuto: ${plan.target}`);
  }
}
