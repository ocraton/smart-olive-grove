import * as mqtt from "mqtt";

// Configurazione
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const TOPIC_INTERNAL_SYMPTOM = "managed/analyze/symptom"; // Input
const TOPIC_INTERNAL_PLAN = "managed/plan/command"; // Output

// Knowledge Vincoli
const WIND_SAFE_LIMIT = 15.0;

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

function plan(symptom: any) {
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
            `✋ [PLANNER] CONFLITTO: Infestazione ma Vento Alto (${symptom.wind_speed}). POSTICIPO.`
          );
          // Nessuna azione (Wait)
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
