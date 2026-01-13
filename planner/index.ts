import * as mqtt from "mqtt";
import axios from "axios";

// Configurazione
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
// const MQTT_BROKER_URL = "mqtt://localhost:1883";
const TOPIC_INTERNAL_SYMPTOM = "managed/analyze/symptom"; // Input
const TOPIC_INTERNAL_PLAN = "managed/plan/command"; // Output

// --- CONFIGURAZIONE INFLUXDB ---
const INFLUX_URL = process.env.INFLUX_URL || "http://influxdb:8086";
// const INFLUX_URL = process.env.INFLUX_URL || "http://localhost:8086";
const DATABASE_NAME = "olive_grove_db";

// Knowledge Vincoli
const WIND_SAFE_LIMIT = 15.0;
const TRAP_COUNT_THRESHOLD_LIMIT = 70; // supponiamo che oltre 70 insetti sia una soglia critica per la quale è impossibile rimandare anche con vento alto
const TIME_DELAY_THRESHOLD = 1; // mettiamo 1 minuto di posticipo solo per test

// Stato interno (Memoria del Planner)
let irrigationActive = false;
let antifrostActive = false;
let nebulizerActive = false;

console.log("[PLANNER] Avvio servizio...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ [PLANNER] Connesso");
  client.subscribe(TOPIC_INTERNAL_SYMPTOM);
});

client.on("message", (topic, message) => {
  const symptom = JSON.parse(message.toString());
  plan(symptom);
});

async function plan(symptom: any) {
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
        console.log("💡 [PLANNER] Decisione: Stop Irrigazione");
        publishPlan("drip_valve", "OFF");
        irrigationActive = false;
      }
      break;

    // --- PEST CONTROL (Conflitti) ---
    case "PEST_INFESTATION":
      if (!nebulizerActive) {
        // Verifica Vincolo Vento
        if (symptom.wind_speed < WIND_SAFE_LIMIT) {
          console.log(
            "💡 [PLANNER] Decisione: Attivare Nebulizzatore (Vento OK)"
          );
          publishPlan("nebulizer_pump", "ON");
          nebulizerActive = true;
        } else {
          console.log(
            `✋ [PLANNER] CONFLITTO: Infestazione: ${symptom.count} ma Vento Alto (${symptom.wind_speed}). POSTICIPO.`
          );
          if(symptom.count > TRAP_COUNT_THRESHOLD_LIMIT){
            console.log("💡 [PLANNER] Emergenza Insetti! Attivo NONOSTANTE il vento.");
            publishPlan("nebulizer_pump", "ON");
            nebulizerActive = true;
          } else {

            // leggiamo lo storico da InfluxDb per decidere il posticipo 
            // facendo la differenza: now() - ultimo evento di posticipo
            console.log(
              "💡 [PLANNER] -------> Verifica posticipo <-------"
            );
            if (await checkIfDelayedTooLong() ) {
              console.log("⚠️ [PLANNER] Delay troppo lungo! Attivo nebulizzatore NONOSTANTE il vento.");
              publishPlan("nebulizer_pump", "ON");
              nebulizerActive = true;
            } else {
              console.log("⏸️ [PLANNER] Posticipo ancora sicuro. Aspetto che il vento cali.");
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
        console.log("💡 [PLANNER] Decisione: Protezione Gelo URGENTE");
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

function publishPlan(targetActor: string, action: string) {
  const payload = JSON.stringify({ target: targetActor, action: action });
  client.publish(TOPIC_INTERNAL_PLAN, payload);
}


const checkIfDelayedTooLong = async (): Promise<boolean> => {
  try {
    // Query InfluxQL per ottenere l'ultimo evento
    const query = `SELECT * FROM delay_events ORDER BY time DESC LIMIT 1`;

    const response = await axios.get(`${INFLUX_URL}/query`, {
      params: {
        q: query,
        db: DATABASE_NAME,
        epoch: "ms", // tempo in millisecondi
      },
    });

    // Controllo risposta
    const results = response.data?.results;
    if (!results || !results[0] || !results[0].series) {
      console.log(
        "ℹ️ [PLANNER] Primo posticipo - registro evento su InfluxDB."
      );
      await logDelayEvent(); // Scrivi evento SOLO al primo posticipo
      return false; // Mai posticipato prima - è sicuro aspettare
    }

    // Estrazione dati
    // series[0].columns ci dice l'ordine, series[0].values i dati.
    // Solitamente values[0][0] è il time se usiamo SELECT *
    const lastEventValues = results[0].series[0].values[0];
    const lastDelayTimestamp = lastEventValues[0]; // Grazie a 'epoch: ms' questo è un numero!

    const currentTime = Date.now();
    const timeDiffMinutes = (currentTime - lastDelayTimestamp) / (1000 * 60);

    console.log(
      `⏱️ [PLANNER] Ultimo delay: ${timeDiffMinutes.toFixed(
        1
      )} min fa (Soglia: ${TIME_DELAY_THRESHOLD})`
    );

    return timeDiffMinutes >= TIME_DELAY_THRESHOLD;
  } catch (e) {
    console.error(
      "❌ [PLANNER] Errore lettura InfluxDB:",
      e instanceof Error ? e.message : String(e)
    );
    // Se il DB fallisce e c'è vento alto
    // meglio aspettare che attivare pesticidi col vento senza sapere lo storico.
    return false;
  }
};

const logDelayEvent = async (): Promise<void> => {
  try {
    // usa il timestamp del server di InfluxDB 
    const writeUrl = `${INFLUX_URL}/write?db=${DATABASE_NAME}`;

    // Line Protocol: measurement,tags fields
    // reason=high_wind è un TAG (indicizzato)
    // postponed=1 è un FIELD (valore)
    // Non mettiamo il timestamp alla fine, così usa "NOW" del server
    const lineProtocol = `delay_events,reason=high_wind postponed=1`;

    await axios.post(writeUrl, lineProtocol, {
      headers: { "Content-Type": "text/plain" }, // Line protocol è testo
    });

    console.log("📝 [PLANNER] Evento di posticipo salvato su InfluxDB");
  } catch (e) {
    console.error(
      "❌ [PLANNER] Errore scrittura InfluxDB:",
      e instanceof Error ? e.message : String(e)
    );
  }
};