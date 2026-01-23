import * as mqtt from "mqtt";
import axios from "axios";

const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";

console.log("[PLANNER] Avvio servizio...");

// Memoria dello stato attuale per gestire i conflitti
// Map<ActuatorID, { command: string, priority: number }>
const actuatorsState = new Map<string, { command: string; priority: number }>();

async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const res = await axios.get(CONFIG_SERVICE_URL);
      return res.data;
    } catch (error) {
      attempts++;
      console.warn(`⚠️ [PLANNER] Waiting for Config... (${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startPlanner() {
  const config = await fetchConfigWithRetry();
  const inputTopic = config.internal_topics.symptom;
  const outputTopic = config.internal_topics.plan;

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ [PLANNER] Connesso.");
    client.subscribe(inputTopic);
  });

  client.on("message", (topic, message) => {
    const symptom = JSON.parse(message.toString());
    const { target_actuators, command } = symptom.actions;
    const priority = symptom.priority || 0;

    if (!target_actuators) return;

    // Per ogni attuatore richiesto dal loop
    target_actuators.forEach((actuatorId: string) => {
      const currentState = actuatorsState.get(actuatorId);

      // LOGICA DI CONFLITTO (Conflict Resolution)
      // Accettiamo il comando se:
      // 1. Non c'è nessun comando precedente
      // 2. Il nuovo comando ha priorità MAGGIORE o UGUALE a quello attuale
      // 3. (Opzionale) Timeout per resettare le priorità vecchie

      let shouldExecute = false;

      if (!currentState) {
        shouldExecute = true;
      } else if (priority >= currentState.priority) {
        // Override! Priorità più alta vince
        shouldExecute = true;
        if (currentState.command !== command) {
          console.log(
            `⚡ [PLANNER] Conflict Override su ${actuatorId}: Priorità ${priority} batte ${currentState.priority}`,
          );
        }
      } else {
        console.log(
          `🛡️ [PLANNER] Comando ignorato per ${actuatorId}: Priorità ${priority} troppo bassa (Attuale: ${currentState.priority})`,
        );
      }

      if (shouldExecute) {
        // Aggiorna lo stato
        actuatorsState.set(actuatorId, { command, priority });

        // Pubblica il piano
        const plan = {
          target: actuatorId,
          action: command,
        };
        client.publish(outputTopic, JSON.stringify(plan));
      }
    });
  });
}

startPlanner();
