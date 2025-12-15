import * as mqtt from "mqtt";
import axios from "axios";
import {
  TOPIC_SENSOR_WEATHER,
  TOPIC_ACTUATOR_VALVE,
  TOPIC_ACTUATOR_ANTIFROST,
  TOPIC_ACTUATOR_NEBULIZER,
  MQTT_BROKER_URL,
  INFLUX_URL,
  DATABASE_NAME,
  HUMIDITY_THRESHOLD_CRITICAL,
  HUMIDITY_THRESHOLD_TARGET,
  TRAP_THRESHOLD_RISK,
  WIND_SAFE_LIMIT,
  TEMP_RISK_ZONE,
  TEMP_FREEZING,
  MAX_DROP_RATE,
} from "./constants";

// Stato interno
let isIrrigating = false;
let isAntifrostActive = false;
let isNebulizing = false;

console.log("🧠 Avvio Manager (A: Idro, B: Mosca, C: Gelo)...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ Manager connesso a Mosquitto!");
  client.subscribe(TOPIC_SENSOR_WEATHER);
});

client.on("message", async (topic, message) => {
  if (topic === TOPIC_SENSOR_WEATHER) {
    try {
      const data = JSON.parse(message.toString());
      // Estrai tutti i dati dal sensore
      await analyzeAndPlan(
        data.humidity,
        data.temperature,
        data.wind_speed,
        data.trap_count
      );
    } catch (e) {
      console.error("❌ Errore generico:", e);
    }
  }
});

async function analyzeAndPlan(
  humidity: number,
  temperature: number,
  wind: number,
  traps: number
) {
  // --- SCENARIO A: IDRATAZIONE ---
  if (humidity < HUMIDITY_THRESHOLD_CRITICAL && !isIrrigating) {
    console.log(`⚠️ [ANALYZE - A] Umidità critica!`);
    executeCommand(TOPIC_ACTUATOR_VALVE, "ON");
    isIrrigating = true;
  } else if (humidity >= HUMIDITY_THRESHOLD_TARGET && isIrrigating) {
    console.log(`✅ [ANALYZE - A] Umidità ripristinata.`);
    executeCommand(TOPIC_ACTUATOR_VALVE, "OFF");
    isIrrigating = false;
  }

  // --- SCENARIO B: PEST CONTROL (con Vincolo Vento) ---
  if (traps > TRAP_THRESHOLD_RISK) {
    if (!isNebulizing) {
      // C'è un'infestazione. Posso trattare?
      if (wind < WIND_SAFE_LIMIT) {
        console.log(
          `🪰 [ANALYZE - B] Infestazione rilevata (${traps}). Vento OK (${wind}km/h).`
        );
        console.log(`🚀 [PLAN - B] Avvio trattamento.`);
        executeCommand(TOPIC_ACTUATOR_NEBULIZER, "ON");
        isNebulizing = true;
      } else {
        console.log(
          `✋ [ANALYZE - B] Infestazione (${traps}) MA Vento forte (${wind}km/h).`
        );
        console.log(
          `⏳ [PLAN - B] Trattamento POSTICIPATO (Constraint: Safety).`
        );
        // NON invio ON. Aspetto che il vento cali.
      }
    } else {
      // Sto già trattando. Devo fermarmi se si alza il vento? (Opzionale, per ora lasciamo finire)
    }
  } else if (traps < 10 && isNebulizing) {
    // Infestazione risolta
    console.log(`✅ [ANALYZE - B] Infestazione debellata.`);
    executeCommand(TOPIC_ACTUATOR_NEBULIZER, "OFF");
    isNebulizing = false;
  }

  // --- SCENARIO C: PROTEZIONE GELO (Predittivo) ---
  if (temperature <= TEMP_FREEZING && !isAntifrostActive) {
    console.log(`❄️ [ANALYZE - C] GELO RILEVATO! Attivazione reattiva.`);
    executeCommand(TOPIC_ACTUATOR_ANTIFROST, "ON");
    isAntifrostActive = true;
  } else if (
    temperature <= TEMP_RISK_ZONE &&
    temperature > TEMP_FREEZING &&
    !isAntifrostActive
  ) {
    // Logica Predittiva InfluxDB
    const query = `SELECT temperature FROM mqtt_consumer WHERE time > now() - 30m LIMIT 1`;
    try {
      const response = await axios.get(INFLUX_URL, {
        params: { q: query, db: DATABASE_NAME },
      });
      const series = response.data.results[0].series;

      if (series && series[0].values.length > 0) {
        const oldTemp = series[0].values[0][1];
        const dropRate = (oldTemp - temperature) / 0.5;

        if (dropRate > MAX_DROP_RATE) {
          console.log(
            `⚠️ [PLAN - C] PREDIZIONE: Crollo termico rapido (-${dropRate.toFixed(
              1
            )}°C/h)!`
          );
          executeCommand(TOPIC_ACTUATOR_ANTIFROST, "ON");
          isAntifrostActive = true;
        }
      }
    } catch (error) {
      /* Ignora errori db per pulizia log */
    }
  } else if (temperature > TEMP_RISK_ZONE && isAntifrostActive) {
    executeCommand(TOPIC_ACTUATOR_ANTIFROST, "OFF");
    isAntifrostActive = false;
  }
}

function executeCommand(topic: string, command: string) {
  const payload = JSON.stringify({
    command: command,
    timestamp: new Date().toISOString(),
  });
  client.publish(topic, payload);
}
