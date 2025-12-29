import * as mqtt from "mqtt";
import axios from "axios";

// Configurazione
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const INFLUX_URL = process.env.INFLUX_URL || "http://influxdb:8086/query";
const DATABASE_NAME = "olive_grove_db";

// Topics
const TOPIC_INTERNAL_MONITOR = "managed/monitor/weather"; // Input
const TOPIC_INTERNAL_SYMPTOM = "managed/analyze/symptom"; // Output

// Soglie (Knowledge)
const HUMIDITY_LOW = 30.0;
const HUMIDITY_OK = 35.0;
const TRAP_LIMIT = 50;
const TEMP_RISK = 3.0;
const TEMP_FREEZING = 0.0;
const MAX_DROP_RATE = 2.0;

console.log("🔍 [ANALYZER] Avvio servizio...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ [ANALYZER] Connesso");
  client.subscribe(TOPIC_INTERNAL_MONITOR);
});

client.on("message", async (topic, message) => {
  if (topic === TOPIC_INTERNAL_MONITOR) {
    const data = JSON.parse(message.toString());
    await analyze(data);
  }
});

async function analyze(data: any) {
  // 1. Analisi Umidità (Siccità)
  if (data.humidity < HUMIDITY_LOW) {
    publishSymptom("DROUGHT_DETECTED", {
      severity: "CRITICAL",
      value: data.humidity,
    });
  } else if (data.humidity >= HUMIDITY_OK) {
    publishSymptom("HUMIDITY_RESTORED", { value: data.humidity });
  }

  // 2. Analisi Parassiti
  if (data.trap_count > TRAP_LIMIT) {
    publishSymptom("PEST_INFESTATION", {
      count: data.trap_count,
      wind_speed: data.wind_speed, // passiamo anche la velocità del vento per i vincoli
    });
  } else if (data.trap_count < 10) {
    publishSymptom("PEST_CLEARED", {});
  }

  // 3. Analisi Gelo (Predittiva)
  if (data.temperature <= TEMP_FREEZING) {
    publishSymptom("FROST_DETECTED", { temp: data.temperature });
  } else if (data.temperature <= TEMP_RISK) {
    // Controllo InfluxDB per trend
    try {
      const query = `SELECT temperature FROM mqtt_consumer WHERE time > now() - 30m LIMIT 1`;
      const response = await axios.get(INFLUX_URL, {
        params: { q: query, db: DATABASE_NAME },
      });
      const series = response.data.results[0].series;

      if (series && series[0].values.length > 0) {
        const oldTemp = series[0].values[0][1];
        const dropRate = (oldTemp - data.temperature) / 0.5; // °C/h

        if (dropRate > MAX_DROP_RATE) {
          publishSymptom("FROST_RISK_PREDICTED", {
            current_temp: data.temperature,
            drop_rate: dropRate,
          });
        }
      }
    } catch (e) {
      /* silent fail */
    }
  } else if (data.temperature > TEMP_RISK) {
    publishSymptom("FROST_RISK_CLEARED", {});
  }
}

function publishSymptom(type: string, details: any) {
  const payload = JSON.stringify({ type, ...details });
  console.log(`⚠️ [ANALYZER] Sintomo: ${type}`);
  client.publish(TOPIC_INTERNAL_SYMPTOM, payload);
}
