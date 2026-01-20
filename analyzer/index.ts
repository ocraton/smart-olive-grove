import * as mqtt from "mqtt";
import axios from "axios";

// Configurazione
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const INFLUX_URL = process.env.INFLUX_URL || "http://influxdb:8086/query";
const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const DATABASE_NAME = "olive_grove_db";

console.log("[ANALYZER] Avvio servizio...");

async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const response = await axios.get(CONFIG_SERVICE_URL);
      console.log("📥 [ANALYZER] Configurazione ricevuta.");
      return response.data;
    } catch (error) {
      attempts++;
      console.warn(
        `⚠️ [ANALYZER] Config Service non raggiungibile (Tentativo ${attempts}). Riprovo tra 3s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startAnalyzer() {
  // 1. Fetch Iniziale ROBUSTA
  const config = await fetchConfigWithRetry();
  const topics = config.topics;

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [ANALYZER] Connesso");
    client.subscribe(topics.internal_monitor);
  });

  client.on("message", async (topic, message) => {
    if (topic === topics.internal_monitor) {
      const data = JSON.parse(message.toString());
      await analyze(client, data, topics);
    }
  });
}

// Helper per scaricare regole fresche (Hot Reload) durante l'esecuzione
// Qui NON usiamo il retry bloccante, perché se fallisce saltiamo solo un ciclo
async function getRules() {
  try {
    const response = await axios.get(CONFIG_SERVICE_URL);
    return response.data.knowledge;
  } catch (error) {
    console.error("❌ Config Service Error (Hot Reload fallito)");
    return null;
  }
}

async function analyze(client: mqtt.MqttClient, data: any, topics: any) {
  // 1. SCARICA REGOLE AGGIORNATE
  const rules = await getRules();
  if (!rules) return;

  const publishSymptom = (type: string, details: any) => {
    const payload = JSON.stringify({ type, ...details });
    console.log(`⚠️ [ANALYZER] Sintomo: ${type}`);
    client.publish(topics.internal_symptom, payload);
  };

  // 2. LOGICA ANALISI

  // A. Umidità
  if (data.humidity < rules.humidity_low) {
    publishSymptom("DROUGHT_DETECTED", {
      severity: "CRITICAL",
      value: data.humidity,
    });
  } else if (data.humidity >= rules.humidity_ok) {
    publishSymptom("HUMIDITY_RESTORED", { value: data.humidity });
  }

  // B. Parassiti
  if (data.trap_count > rules.pest_trap_limit) {
    publishSymptom("PEST_INFESTATION", {
      count: data.trap_count,
      wind_speed: data.wind_speed,
    });
  } else if (data.trap_count < 10) {
    publishSymptom("PEST_CLEARED", {});
  }

  // C. Gelo
  if (data.temperature <= rules.temp_freezing) {
    publishSymptom("FROST_DETECTED", { temp: data.temperature });
  } else if (data.temperature <= rules.temp_risk) {
    try {
      const query = `SELECT temperature FROM mqtt_consumer WHERE time >= now() - 30m`;
      const response = await axios.get(INFLUX_URL, {
        params: { q: query, db: DATABASE_NAME },
      });
      const resultData = response.data?.results?.[0]?.series?.[0]?.values;

      if (resultData && resultData.length > 10) {
        const startAvg =
          resultData
            .slice(0, 5)
            .reduce((acc: number, curr: any) => acc + curr[1], 0) / 5;
        const endAvg =
          resultData
            .slice(-5)
            .reduce((acc: number, curr: any) => acc + curr[1], 0) / 5;
        const dropRate = (startAvg - endAvg) / 0.5;

        console.log(
          `Trend: ${startAvg.toFixed(2)} -> ${endAvg.toFixed(2)} | Rate: ${dropRate.toFixed(2)}`,
        );

        if (dropRate > rules.temp_max_drop_rate) {
          publishSymptom("FROST_RISK_PREDICTED", {
            current_temp: endAvg,
            drop_rate: dropRate,
          });
        }
      }
    } catch (e) {
      console.error("Influx Error", e);
    }
  } else if (data.temperature > rules.temp_risk) {
    publishSymptom("FROST_RISK_CLEARED", {});
  }
}

startAnalyzer();
