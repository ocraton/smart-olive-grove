import * as mqtt from "mqtt";
import axios from "axios";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const INFLUX_URL = process.env.INFLUX_URL || "http://influxdb:8086";
const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const DATABASE_NAME = "olive_grove_db";

let irrigationActive = false;
let antifrostActive = false;
let nebulizerActive = false;

console.log("[PLANNER] Avvio servizio...");

async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const response = await axios.get(CONFIG_SERVICE_URL);
      console.log("📥 [PLANNER] Configurazione ricevuta.");
      return response.data;
    } catch (error) {
      attempts++;
      console.warn(
        `⚠️ [PLANNER] Config Service non raggiungibile (Tentativo ${attempts}). Riprovo tra 3s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startPlanner() {
  // 1. Fetch Iniziale ROBUSTA
  const config = await fetchConfigWithRetry();
  const topics = config.topics;

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [PLANNER] Connesso");
    client.subscribe(topics.internal_symptom);
  });

  client.on("message", async (topic, message) => {
    const symptom = JSON.parse(message.toString());
    await plan(client, symptom, topics);
  });
}

// Helper Regole (Hot Reload)
async function getRules() {
  try {
    const response = await axios.get(CONFIG_SERVICE_URL);
    return response.data.knowledge;
  } catch (error) {
    return null;
  }
}

async function plan(client: mqtt.MqttClient, symptom: any, topics: any) {
  const rules = await getRules();
  if (!rules) return;

  const publishPlan = (target: string, action: string) => {
    const payload = JSON.stringify({ target, action });
    client.publish(topics.internal_plan, payload);
  };

  switch (symptom.type) {
    // --- IDRATAZIONE ---
    case "DROUGHT_DETECTED":
      if (!irrigationActive) {
        console.log("💡 [PLANNER] Decisione: Attivare Irrigazione");
        publishPlan("drip_valve", "ON");
        irrigationActive = true;
      }
      break;
    case "HUMIDITY_RESTORED":
      if (irrigationActive) {
        publishPlan("drip_valve", "OFF");
        irrigationActive = false;
      }
      break;

    // --- PEST CONTROL ---
    case "PEST_INFESTATION":
      if (!nebulizerActive) {
        if (symptom.wind_speed < rules.wind_safe_limit) {
          console.log(
            "💡 [PLANNER] Decisione: Attivare Nebulizzatore (Vento OK)",
          );
          publishPlan("nebulizer_pump", "ON");
          nebulizerActive = true;
        } else {
          console.log(`✋ [PLANNER] CONFLITTO: Vento Alto. Verifica Soglie.`);

          if (symptom.count > rules.pest_trap_critical_limit) {
            console.log("💡 [PLANNER] Emergenza! Attivo NONOSTANTE il vento.");
            publishPlan("nebulizer_pump", "ON");
            nebulizerActive = true;
          } else {
            if (await checkIfDelayedTooLong(rules.postpone_delay_minutes)) {
              console.log(
                "⚠️ [PLANNER] Delay scaduto. Attivo NONOSTANTE il vento.",
              );
              publishPlan("nebulizer_pump", "ON");
              nebulizerActive = true;
            } else {
              console.log("⏸️ [PLANNER] Posticipo ancora sicuro.");
            }
          }
        }
      }
      break;
    case "PEST_CLEARED":
      if (nebulizerActive) {
        publishPlan("nebulizer_pump", "OFF");
        nebulizerActive = false;
      }
      break;

    // --- GELO ---
    case "FROST_DETECTED":
    case "FROST_RISK_PREDICTED":
      if (!antifrostActive) {
        console.log("💡 [PLANNER] Decisione: Protezione Gelo");
        publishPlan("antifrost_valve", "ON");
        antifrostActive = true;
      }
      break;
    case "FROST_RISK_CLEARED":
      if (antifrostActive) {
        publishPlan("antifrost_valve", "OFF");
        antifrostActive = false;
      }
      break;
  }
}

// Helper InfluxDB
const checkIfDelayedTooLong = async (
  delayThreshold: number,
): Promise<boolean> => {
  try {
    const query = `SELECT * FROM delay_events ORDER BY time DESC LIMIT 1`;
    const response = await axios.get(`${INFLUX_URL}/query`, {
      params: { q: query, db: DATABASE_NAME, epoch: "ms" },
    });
    const results = response.data?.results;
    if (!results || !results[0] || !results[0].series) {
      await logDelayEvent();
      return false;
    }
    const lastEventValues = results[0].series[0].values[0];
    const timeDiffMinutes = (Date.now() - lastEventValues[0]) / (1000 * 60);
    console.log(
      `⏱️ [PLANNER] Delay: ${timeDiffMinutes.toFixed(1)} min (Soglia: ${delayThreshold})`,
    );
    return timeDiffMinutes >= delayThreshold;
  } catch (e) {
    return false;
  }
};

const logDelayEvent = async (): Promise<void> => {
  try {
    const writeUrl = `${INFLUX_URL}/write?db=${DATABASE_NAME}`;
    await axios.post(writeUrl, `delay_events,reason=high_wind postponed=1`, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e) {
    console.error("Errore Influx Write");
  }
};

startPlanner();
