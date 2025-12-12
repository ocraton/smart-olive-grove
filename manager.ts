import * as mqtt from "mqtt";
import axios from "axios"; // Usiamo axios per parlare con InfluxDB

// --- CONFIGURAZIONE ---
const MQTT_BROKER_URL = "mqtt://localhost:1883";
const INFLUX_URL = "http://localhost:8086/query"; // URL per le query v1.8
const DATABASE_NAME = "olive_grove_db";

// Topics
const TOPIC_SENSOR_WEATHER = "oliveto/sensors/weather";
const TOPIC_ACTUATOR_VALVE = "oliveto/actuators/drip_valve";
const TOPIC_ACTUATOR_ANTIFROST = "oliveto/actuators/antifrost_valve"; // Nuovo attuatore

// Knowledge (Soglie)
const HUMIDITY_THRESHOLD_CRITICAL = 30.0;
const HUMIDITY_THRESHOLD_TARGET = 35.0;
const TEMP_RISK_ZONE = 3.0; // Sotto i 3 gradi controllo il trend
const TEMP_FREEZING = 0.0;
const MAX_DROP_RATE = 2.0; // Gradi per ora

// Stato interno
let isIrrigating = false;
let isAntifrostActive = false;

console.log("🧠 Avvio Smart Olive Grove Manager (con Predizione)...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ Manager connesso a Mosquitto!");
  client.subscribe(TOPIC_SENSOR_WEATHER);
});

client.on("message", async (topic, message) => {
  if (topic === TOPIC_SENSOR_WEATHER) {
    try {
      const data = JSON.parse(message.toString());
      const currentHumidity = data.humidity;
      const currentTemp = data.temperature;

      console.log(
        `📊 [MONITOR] Temp: ${currentTemp.toFixed(
          2
        )}°C, Hum: ${currentHumidity.toFixed(2)}%`
      );

      // Notare "await": ora analyzeAndPlan è asincrona perché deve aspettare il DB
      await analyzeAndPlan(currentHumidity, currentTemp);
    } catch (e) {
      console.error("❌ Errore generico:", e);
    }
  }
});

// La funzione ora accetta anche la temperatura ed è ASINCRONA (async)
async function analyzeAndPlan(humidity: number, temperature: number) {
  // --- SCENARIO A: IDRATAZIONE (Regole semplici) ---
  if (humidity < HUMIDITY_THRESHOLD_CRITICAL && !isIrrigating) {
    console.log(`⚠️ [ANALYZE - A] Umidità critica!`);
    executeCommand(TOPIC_ACTUATOR_VALVE, "ON");
    isIrrigating = true;
  } else if (humidity >= HUMIDITY_THRESHOLD_TARGET && isIrrigating) {
    console.log(`✅ [ANALYZE - A] Umidità ripristinata.`);
    executeCommand(TOPIC_ACTUATOR_VALVE, "OFF");
    isIrrigating = false;
  }

  // --- SCENARIO C: PROTEZIONE GELO (Predittivo) ---

  // Caso 1: È già gelato -> Azione Reattiva Immediata
  if (temperature <= TEMP_FREEZING && !isAntifrostActive) {
    console.log(`❄️ [ANALYZE - C] GELO RILEVATO! Attivazione reattiva.`);
    executeCommand(TOPIC_ACTUATOR_ANTIFROST, "ON");
    isAntifrostActive = true;
  }
  // Caso 2: Siamo in zona rischio -> Interroghiamo la Knowledge (InfluxDB)
  else if (
    temperature <= TEMP_RISK_ZONE &&
    temperature > TEMP_FREEZING &&
    !isAntifrostActive
  ) {
    console.log(
      `🔍 [ANALYZE - C] Zona rischio (${temperature}°C). Interrogo Knowledge Base...`
    );

    // Chiediamo a InfluxDB la temperatura di 30 minuti fa
    // La query SQL-like di InfluxDB
    const query = `SELECT temperature FROM mqtt_consumer WHERE time > now() - 30m LIMIT 1`;

    try {
      const response = await axios.get(INFLUX_URL, {
        params: { q: query, db: DATABASE_NAME },
      });

      // Parsing della risposta un po' complessa di InfluxDB
      const series = response.data.results[0].series;

      if (series && series[0].values.length > 0) {
        const oldTemp = series[0].values[0][1]; // Il valore è nella seconda colonna
        const timeDiffHours = 0.5; // Stiamo guardando 30 minuti fa (0.5 ore)

        // CALCOLO DEL TREND (Fisica)
        // Se era 5°C e ora è 2°C -> diff = 3 -> Rate = 3 / 0.5 = 6°C/h
        const dropAmount = oldTemp - temperature;
        const dropRate = dropAmount / timeDiffHours;

        console.log(
          `   Knowledge: 30min fa era ${oldTemp}°C. Rate: -${dropRate.toFixed(
            2
          )}°C/h`
        );

        if (dropRate > MAX_DROP_RATE) {
          console.log(
            `⚠️ [PLAN - C] PREDIZIONE: Crollo termico rapido! Attivo protezioni in anticipo.`
          );
          executeCommand(TOPIC_ACTUATOR_ANTIFROST, "ON");
          isAntifrostActive = true;
        } else {
          console.log(`   [PLAN - C] Trend stabile. Nessuna azione.`);
        }
      }
    } catch (error) {
      console.error("❌ Errore lettura InfluxDB:", error);
    }
  }
  // Caso 3: Temperatura risalita -> Spegni tutto
  else if (temperature > TEMP_RISK_ZONE && isAntifrostActive) {
    console.log(`☀️ [ANALYZE - C] Pericolo cessato.`);
    executeCommand(TOPIC_ACTUATOR_ANTIFROST, "OFF");
    isAntifrostActive = false;
  }
}

function executeCommand(topic: string, command: string) {
  const payload = JSON.stringify({
    command: command,
    timestamp: new Date().toISOString(),
  });
  console.log(`🚀 [EXECUTE] Invio ${command} a ${topic}`);
  client.publish(topic, payload);
}
