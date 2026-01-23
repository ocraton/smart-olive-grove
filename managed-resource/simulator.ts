import * as mqtt from "mqtt";
import axios from "axios";

const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";

// Stato Fisico (Simulato)
let physics = {
  temperature: -2.0, // <--- TEST: Gelo Immediato! (Triggera Scenario C)
  humidity: 40.0, // Normale
  wind_speed: 5.0, // Normale
  trap_count: 0, // Niente parassiti
};

// Stato Attuatori (Dinamico)
const actuatorsState: { [key: string]: string } = {};

console.log(`🌱 Avvio Simulatore Generico...`);

async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const response = await axios.get(CONFIG_SERVICE_URL);
      console.log("📥 [SIMULATOR] Configurazione ricevuta.");
      return response.data;
    } catch (error) {
      attempts++;
      console.warn(
        `⚠️ [SIMULATOR] Config Service non raggiungibile (Tentativo ${attempts}). Riprovo tra 3s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function startSimulator() {
  const config = await fetchConfigWithRetry();
  const devices = config.devices;

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log("✅ Simulatore connesso a Mosquitto!");

    // Sottoscrizione dinamica a TUTTI gli attuatori definiti
    devices.actuators.forEach((act: any) => {
      console.log(`🔌 Sottoscrizione attuatore: ${act.id} su ${act.topic}`);
      client.subscribe(act.topic);
      actuatorsState[act.id] = "OFF"; // Init state
    });

    // Avvio loop fisico
    setInterval(() => simulationLoop(client, devices.sensors), 5000);
  });

  client.on("message", (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      // Trova quale attuatore corrisponde al topic
      const actuator = devices.actuators.find((a: any) => a.topic === topic);

      if (actuator) {
        actuatorsState[actuator.id] = payload.command;
        console.log(`⚙️ [ACTUATOR] ${actuator.id} -> ${payload.command}`);

        // Retroazione semplice sulla fisica
        if (actuator.id === "drip_valve_main" && payload.command === "ON") {
          physics.humidity += 5;
        }
        if (actuator.id === "nebulizer_pump" && payload.command === "ON") {
          physics.trap_count = Math.max(0, physics.trap_count - 10);
        }
      }
    } catch (e) {
      console.error("Err parse");
    }
  });
}

function simulationLoop(client: mqtt.MqttClient, sensors: any[]) {
  // 1. Evoluzione Fisica (Random walk)
  physics.temperature -= 0.1; // Trend freddo
  physics.wind_speed += (Math.random() - 0.5) * 5;
  physics.trap_count += 2;
  if (physics.wind_speed < 0) physics.wind_speed = 0;

  // 2. Pubblicazione Dati per OGNI sensore definito
  const timestamp = new Date().toISOString();

  sensors.forEach((sensor: any) => {
    // In questo esempio semplificato, tutti i sensori pubblicano lo stesso stato "ambientale"
    // In un caso reale, sensori diversi pubblicherebbero dati diversi.
    const payload = {
      sensor_id: sensor.id,
      ...physics,
      timestamp,
    };
    client.publish(sensor.topic, JSON.stringify(payload));
    console.log(`📡 [SENSOR] ${sensor.id} invia dati su ${sensor.topic}`);
  });
}

startSimulator();
