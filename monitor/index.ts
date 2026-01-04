import * as mqtt from "mqtt";

// Configurazione
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const TOPIC_mV_SENSORS = "oliveto/sensors/weather"; // Input dal simulatore
const TOPIC_INTERNAL_MONITOR = "managed/monitor/weather"; // Output verso Analyzer

console.log("[MONITOR] Avvio servizio...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ [MONITOR] Connesso al broker");
  client.subscribe(TOPIC_mV_SENSORS);
});

client.on("message", (topic, message) => {
  if (topic === TOPIC_mV_SENSORS) {
    try {
      const rawData = JSON.parse(message.toString());

      // Qui potremmo fare validazione o pulizia dati
      // Per ora inoltriamo il dato strutturato all'Analyzer
      const cleanData = {
        humidity: rawData.humidity,
        temperature: rawData.temperature,
        wind_speed: rawData.wind_speed,
        trap_count: rawData.trap_count,
        timestamp: new Date().toISOString(),
      };

      console.log(
        `📡 [MONITOR] Inoltro dati: T=${cleanData.temperature} H=${cleanData.humidity}`
      );
      client.publish(TOPIC_INTERNAL_MONITOR, JSON.stringify(cleanData));
    } catch (e) {
      console.error("❌ Errore parsing sensore", e);
    }
  }
});
