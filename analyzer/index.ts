import * as mqtt from "mqtt";
import axios from "axios";

// --- FIX URL: Pulizia robusta dell'indirizzo ---
const RAW_URL = process.env.INFLUX_URL || "http://influxdb:8086";
// Rimuove "/query" finale o slash finali se presenti per evitare doppi percorsi (es. /query/query)
const INFLUX_URL = RAW_URL.replace(/\/query\/?$/, "").replace(/\/$/, "");

const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const DATABASE_NAME = "olive_grove_db";

console.log(`[ANALYZER] Avvio servizio... (InfluxDB Base URL: ${INFLUX_URL})`);

// --- 1. HELPER SCRITTURA (Per avviare il timer vento) ---
const logDelayEvent = async (): Promise<void> => {
  try {
    const writeUrl = `${INFLUX_URL}/write?db=${DATABASE_NAME}`;
    await axios.post(writeUrl, `delay_events,reason=high_wind postponed=1`, {
      headers: { "Content-Type": "text/plain" },
    });
    console.log(
      "📝 [ANALYZER] Timer avviato: Evento di posticipo salvato su InfluxDB.",
    );
  } catch (e) {
    console.error(
      "❌ [ANALYZER] Errore scrittura InfluxDB:",
      e instanceof Error ? e.message : String(e),
    );
  }
};

// --- 2. HELPER LETTURA: RITARDO VENTO ---
async function checkIfDelayedTooLong(delayThreshold: number): Promise<boolean> {
  try {
    const query = `SELECT * FROM delay_events ORDER BY time DESC LIMIT 1`;
    const response = await axios.get(`${INFLUX_URL}/query`, {
      params: { q: query, db: DATABASE_NAME, epoch: "ms" },
    });
    const results = response.data?.results;

    // Se non c'è mai stato un evento, è la prima volta -> Scriviamo e aspettiamo
    if (!results || !results[0] || !results[0].series) {
      console.log("ℹ️ [ANALYZER] Primo blocco vento rilevato. Avvio timer...");
      await logDelayEvent();
      return false;
    }

    const lastEventValues = results[0].series[0].values[0];
    const lastTime = lastEventValues[0];
    const timeDiffMinutes = (Date.now() - lastTime) / (1000 * 60);

    // Reset timer se troppo vecchio (> 60 min dall'ultimo evento)
    if (timeDiffMinutes > 60 && delayThreshold < 60) {
      console.log(
        "ℹ️ [ANALYZER] Vecchio timer scaduto da molto. Riavvio per nuovo evento meteo.",
      );
      await logDelayEvent();
      return false;
    }

    return timeDiffMinutes >= delayThreshold;
  } catch (e) {
    // Stampiamo l'errore completo per debug se serve
    if (axios.isAxiosError(e)) {
      console.error(
        `Errore InfluxDB (${e.response?.status} ${e.response?.statusText}):`,
        e.config?.url,
      );
    } else {
      console.error("Errore generico lettura InfluxDB:", e);
    }
    return false;
  }
}

// --- 3. HELPER LETTURA: TREND TEMPERATURA ---
async function checkDropRateHigh(threshold: number): Promise<boolean> {
  try {
    const query = `SELECT temperature FROM mqtt_consumer WHERE time >= now() - 30m`;
    const response = await axios.get(`${INFLUX_URL}/query`, {
      params: { q: query, db: DATABASE_NAME, epoch: "ms" },
    });
    const resultData = response.data?.results?.[0]?.series?.[0]?.values;

    if (!resultData || resultData.length < 5) return false;

    const startValues = resultData.slice(0, 5);
    const endValues = resultData.slice(-5);

    const startAvg =
      startValues.reduce((acc: number, curr: any) => acc + curr[1], 0) /
      startValues.length;
    const endAvg =
      endValues.reduce((acc: number, curr: any) => acc + curr[1], 0) /
      endValues.length;

    const diff = startAvg - endAvg;
    const dropRate = diff * 2;

    if (dropRate > threshold) {
      console.log(
        `📉 [ANALYZER] Crollo Termico rilevato: ${dropRate.toFixed(2)} °C/h (Soglia: ${threshold})`,
      );
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// --- CONFIGURAZIONE ---
async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const res = await axios.get(CONFIG_SERVICE_URL);
      return res.data;
    } catch (error) {
      attempts++;
      console.warn(`⚠️ [ANALYZER] Waiting for Config... (${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

// --- ENGINE DI VALUTAZIONE ---
async function evaluateCondition(data: any, condition: any): Promise<boolean> {
  if (condition.logic === "AND" && condition.conditions) {
    for (const subCond of condition.conditions) {
      const res = await evaluateCondition(data, subCond);
      if (!res) return false;
    }
    return true;
  }

  if (condition.logic === "OR" && condition.conditions) {
    for (const subCond of condition.conditions) {
      const res = await evaluateCondition(data, subCond);
      if (res) return true;
    }
    return false;
  }

  if (condition.field === "EXT_INFLUX_DELAY") {
    return await checkIfDelayedTooLong(condition.threshold);
  }

  if (condition.field === "EXT_TEMP_DROP_RATE") {
    return await checkDropRateHigh(condition.threshold);
  }

  const value = data[condition.field];
  const threshold = condition.threshold;

  if (value === undefined) return false;

  switch (condition.operator) {
    case "<":
      return value < threshold;
    case ">":
      return value > threshold;
    case "<=":
      return value <= threshold;
    case ">=":
      return value >= threshold;
    case "==":
      return value == threshold;
    default:
      return false;
  }
}

async function startAnalyzer() {
  const config = await fetchConfigWithRetry();
  const inputTopic = config.internal_topics.monitor;
  const outputTopic = config.internal_topics.symptom;

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [ANALYZER] Connesso. Engine pronto.");
    client.subscribe(inputTopic);
  });

  client.on("message", async (topic, message) => {
    if (topic === inputTopic) {
      try {
        const data = JSON.parse(message.toString());
        const sensorId = data.sensor_id;

        for (const loop of config.loops) {
          if (!loop.enabled) continue;

          if (loop.inputs.includes(sensorId)) {
            const isTriggered = await evaluateCondition(data, loop.condition);

            const symptom = {
              loop_id: loop.id,
              triggered: isTriggered,
              priority: loop.priority,
              actions: isTriggered
                ? loop.actions.on_true
                : loop.actions.on_false,
              source_data: data,
            };

            if (symptom.actions && symptom.actions.command !== "NO_OP") {
              if (
                isTriggered &&
                (loop.id === "loop_pest_control_smart" ||
                  loop.id === "loop_frost_protection")
              ) {
                console.log(
                  `⚡ [ANALYZER] Loop Critico '${loop.id}' attivato!`,
                );
              }
              client.publish(outputTopic, JSON.stringify(symptom));
            }
          }
        }
      } catch (e) {
        console.error("Errore processing messaggio", e);
      }
    }
  });
}

startAnalyzer();
