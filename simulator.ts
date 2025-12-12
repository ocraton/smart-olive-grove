import * as mqtt from "mqtt";

// CONFIGURAZIONE
const MQTT_BROKER_URL = "mqtt://localhost:1883";

// Topics
const TOPIC_SENSORS = "oliveto/sensors/weather";
const TOPIC_ACTUATOR_VALVE = "oliveto/actuators/drip_valve";
const TOPIC_ACTUATOR_ANTIFROST = "oliveto/actuators/antifrost_valve";
const TOPIC_ACTUATOR_NEBULIZER = "oliveto/actuators/nebulizer_pump"; // NUOVO

// STATO FISICO (La "realtà" simulata)
let currentTemp = 20.0;
let currentHumidity = 25.0;
let currentWindSpeed = 10.0; // km/h (NUOVO)
let currentTrapCount = 0; // Numero insetti (NUOVO)

// Stato Attuatori
let isValveOpen = false;
let isNebulizerActive = false; // NUOVO

console.log(`🌱 Avvio Simulatore Oliveto (Full Scenarios)...`);
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ Simulatore connesso a Mosquitto!");

  // Sottoscrizione Attuatori
  client.subscribe(TOPIC_ACTUATOR_VALVE);
  client.subscribe(TOPIC_ACTUATOR_ANTIFROST);
  client.subscribe(TOPIC_ACTUATOR_NEBULIZER); // NUOVO

  setInterval(simulationLoop, 5000);
});

// Gestione Comandi
client.on("message", (topic, message) => {
  const payload = JSON.parse(message.toString());
  const command = payload.command;

  if (topic === TOPIC_ACTUATOR_VALVE) {
    if (command === "ON") {
      isValveOpen = true;
      console.log("💧 [Sim] Valvola Irrigazione APERTA.");
    } else {
      isValveOpen = false;
      console.log("🛑 [Sim] Valvola Irrigazione CHIUSA.");
    }
  } else if (topic === TOPIC_ACTUATOR_ANTIFROST) {
    console.log(`❄️ [Sim] Antibrina: ${command}`);
  } else if (topic === TOPIC_ACTUATOR_NEBULIZER) {
    if (command === "ON") {
      isNebulizerActive = true;
      console.log("💨 [Sim] Nebulizzatore ATTIVO (Trattamento in corso).");
    } else {
      isNebulizerActive = false;
      console.log("🛑 [Sim] Nebulizzatore SPENTO.");
    }
  }
});

function simulationLoop() {
  // 1. FISICA TEMPERATURA (Oscillazione)
  currentTemp += Math.random() - 0.5;
  // currentTemp -= 0.2; // Scommenta per testare GELO rapido

  // 2. FISICA UMIDITÀ
  if (isValveOpen) currentHumidity += 4.5;
  else currentHumidity -= 1.0;
  if (currentHumidity < 0) currentHumidity = 0;
  if (currentHumidity > 100) currentHumidity = 100;

  // 3. FISICA VENTO (NUOVO)
  // Il vento cambia casualmente
  currentWindSpeed += (Math.random() - 0.5) * 5;
  if (currentWindSpeed < 0) currentWindSpeed = 0;

  // 4. FISICA MOSCHE (NUOVO)
  if (isNebulizerActive) {
    // Se trattiamo, le mosche muoiono rapidamente
    currentTrapCount -= 10;
    if (currentTrapCount < 0) currentTrapCount = 0;
  } else {
    // Se non trattiamo, le mosche aumentano (infestazione)
    currentTrapCount += 5;
  }

  // Invio Dati
  const payload = {
    temperature: parseFloat(currentTemp.toFixed(2)),
    humidity: parseFloat(currentHumidity.toFixed(2)),
    wind_speed: parseFloat(currentWindSpeed.toFixed(2)), // NUOVO
    trap_count: Math.floor(currentTrapCount), // NUOVO
    timestamp: new Date().toISOString(),
  };

  client.publish(TOPIC_SENSORS, JSON.stringify(payload));

  console.log(
    `📡 [SENSORE] T:${payload.temperature}°C H:${payload.humidity}% W:${payload.wind_speed}km/h 🪰:${payload.trap_count}`
  );
}
