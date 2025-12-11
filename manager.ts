import * as mqtt from "mqtt";

// --- CONFIGURAZIONE ---
const MQTT_BROKER_URL = "mqtt://localhost:1883";

// Topics (Canali di comunicazione)
const TOPIC_SENSOR_WEATHER = "oliveto/sensors/weather";
const TOPIC_ACTUATOR_VALVE = "oliveto/actuators/drip_valve";

// Knowledge (Regole e Soglie)
const HUMIDITY_THRESHOLD_CRITICAL = 30.0; // Sotto il 30% irriga
const HUMIDITY_THRESHOLD_TARGET = 35.0; // Smetti quando arrivi al 35% (isteresi)

// Stato interno (Context Awareness)
let isIrrigating = false;

console.log("🧠 Avvio Smart Olive Grove Manager...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ Manager connesso a Mosquitto!");

  // FASE M (Monitor): Sottoscrizione ai sensori
  client.subscribe(TOPIC_SENSOR_WEATHER, (err) => {
    if (!err) {
      console.log(`👂 In ascolto su: ${TOPIC_SENSOR_WEATHER}`);
    } else {
      console.error("❌ Errore sottoscrizione:", err);
    }
  });
});

client.on("message", (topic, message) => {
  if (topic === TOPIC_SENSOR_WEATHER) {
    // FASE M (Monitor): Parsing dei dati
    try {
      const data = JSON.parse(message.toString());
      const currentHumidity = data.humidity;
      const currentTemp = data.temperature;

      // Log di debug (utile per noi umani)
      console.log(
        `📊 [MONITOR] Temp: ${currentTemp}°C, Umidità: ${currentHumidity}%`
      );

      // FASE A (Analyze) & P (Plan)
      analyzeAndPlan(currentHumidity);
    } catch (e) {
      console.error("❌ Errore nel parsing del messaggio JSON");
    }
  }
});

function analyzeAndPlan(humidity: number) {
  // Regola: Se umidità < 30% E non sto già irrigando -> ATTIVA
  if (humidity < HUMIDITY_THRESHOLD_CRITICAL && !isIrrigating) {
    console.log(
      `⚠️ [ANALYZE] Umidità critica (< ${HUMIDITY_THRESHOLD_CRITICAL}%)!`
    );
    console.log(`💡 [PLAN] Pianificata attivazione irrigazione.`);
    executeIrrigation(true);
  }
  // Regola: Se umidità > 35% E sto irrigando -> DISATTIVA
  else if (humidity >= HUMIDITY_THRESHOLD_TARGET && isIrrigating) {
    console.log(
      `✅ [ANALYZE] Umidità target raggiunta (>= ${HUMIDITY_THRESHOLD_TARGET}%).`
    );
    console.log(`💡 [PLAN] Pianificato stop irrigazione.`);
    executeIrrigation(false);
  }
}

// FASE E (Execute)
function executeIrrigation(turnOn: boolean) {
  const command = turnOn ? "ON" : "OFF";

  // Payload del comando (formato JSON)
  const payload = JSON.stringify({
    command: command,
    timestamp: new Date().toISOString(),
  });

  console.log(`🚀 [EXECUTE] Invio comando Valvola: ${command}`);

  // Pubblica il comando sul topic degli attuatori
  client.publish(TOPIC_ACTUATOR_VALVE, payload);

  // Aggiorna lo stato interno (Knowledge aggiornata)
  isIrrigating = turnOn;
}
