import * as mqtt from "mqtt";

// CONFIGURAZIONE
const MQTT_BROKER_URL = "mqtt://localhost:1883";

// Topics
const TOPIC_SENSORS = "oliveto/sensors/weather";
const TOPIC_ACTUATOR_VALVE = "oliveto/actuators/drip_valve";
const TOPIC_ACTUATOR_ANTIFROST = "oliveto/actuators/antifrost_valve";

// STATO FISICO (La "realtà" simulata)
let currentTemp = 20.0;
let currentHumidity = 25.0; // Partiamo bassi per testare l'attivazione
let isValveOpen = false; // Stato fisico della valvola

console.log(`🌱 Avvio Simulatore Oliveto (Managed Resource)...`);
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ Simulatore connesso a Mosquitto!");

  // 1. TOUCHPOINT ATTUATORE: Ascolta i comandi del Manager
  client.subscribe(TOPIC_ACTUATOR_VALVE, (err) => {
    if (!err)
      console.log(`👂 Attuatore in ascolto su: ${TOPIC_ACTUATOR_VALVE}`);
  });

  client.subscribe(TOPIC_ACTUATOR_ANTIFROST, (err) => {
    if (!err)
      console.log(`👂 Attuatore Antibrina in ascolto su: ${TOPIC_ACTUATOR_ANTIFROST}`);
  });

  // Avvia il loop della fisica e dei sensori (ogni 5 secondi)
  setInterval(simulationLoop, 5000);
});

// Gestione Comandi in arrivo (L'Attuatore agisce)
client.on("message", (topic, message) => {
  if (topic === TOPIC_ACTUATOR_VALVE) {
    try {
      const payload = JSON.parse(message.toString());
      const command = payload.command; // "ON" o "OFF"

      console.log(`⚙️ [ATTUATORE] Ricevuto comando: ${command}`);

      // Modifica lo stato fisico della valvola
      if (command === "ON") {
        isValveOpen = true;
        console.log("💧 Valvola APERTA. L'irrigazione è iniziata.");
      } else {
        isValveOpen = false;
        console.log("🛑 Valvola CHIUSA. L'irrigazione è terminata.");
      }
    } catch (e) {
      console.error("❌ Errore parsing comando attuatore");
    }
  }

  if (topic === TOPIC_ACTUATOR_ANTIFROST) {
    const payload = JSON.parse(message.toString());
    console.log(`❄️ [ATTUATORE ANTIBRINA] Ricevuto: ${payload.command}`);
  }
});

function simulationLoop() {
  // 2. FISICA DELL'AMBIENTE (Simulation Logic)

  // Evoluzione Temperatura (Oscillazione casuale)
  // currentTemp += Math.random() - 0.5;

  // Tendenza al calo (es. notte che avanza)
  currentTemp -= 0.1;

  // Evoluzione Umidità (Logica complessa)
  if (isValveOpen) {
    // Se l'acqua è aperta, l'umidità sale velocemente
    currentHumidity += 4.5;
    console.log(`   (L'acqua sta scorrendo... Umidità +4.5%)`);
  } else {
    // Se l'acqua è chiusa, il sole asciuga la terra
    currentHumidity -= 1.0;
    console.log(`   (Il sole asciuga... Umidità -1.0%)`);
  }

  // Limiti fisici (l'umidità non va sotto 0 o sopra 100)
  if (currentHumidity < 0) currentHumidity = 0;
  if (currentHumidity > 100) currentHumidity = 100;

  // Arrotondamento
  const tempToSend = parseFloat(currentTemp.toFixed(2));
  const humToSend = parseFloat(currentHumidity.toFixed(2));

  // 3. TOUCHPOINT SENSORE: Invia i dati rilevati
  const payload = {
    temperature: tempToSend,
    humidity: humToSend,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(payload);
  client.publish(TOPIC_SENSORS, message);

  console.log(
    `📡 [SENSORE] Dati inviati: Temp ${tempToSend}°C, Hum ${humToSend}%`
  );
}
