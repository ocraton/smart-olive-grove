import * as mqtt from "mqtt";

// CONFIGURAZIONE
const MQTT_BROKER_URL = "mqtt://localhost:1883";
// Questo topic deve corrispondere a quello che abbiamo messo in telegraf.conf
const TOPIC_SENSORS = "oliveto/sensors/weather";

// 1. Connessione al Broker (Mosquitto)
console.log(`🔌 Connessione a Mosquitto in corso (${MQTT_BROKER_URL})...`);
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ Connesso a Mosquitto!");

  // Avvia il loop di simulazione (ogni 5 secondi)
  setInterval(simulateAndPublish, 5000);
});

client.on("error", (err) => {
  console.error("❌ Errore connessione MQTT:", err);
});

// DATI SIMULATI (Stato iniziale)
let currentTemp = 20.0;
let currentHumidity = 50.0;

function simulateAndPublish() {
  // 2. Genera dati finti (Simulazione Fisica semplice)
  // Facciamo oscillare la temperatura casualmente di +/- 0.5 gradi
  const change = Math.random() - 0.5;
  currentTemp += change;

  // Per l'umidità facciamo lo stesso
  currentHumidity += (Math.random() - 0.5) * 2;

  // Arrotondiamo a 2 decimali
  const tempToSend = parseFloat(currentTemp.toFixed(2));
  const humToSend = parseFloat(currentHumidity.toFixed(2));

  // 3. Crea il pacchetto dati (Payload)
  // Telegraf si aspetta un JSON
  const payload = {
    temperature: tempToSend,
    humidity: humToSend,
    timestamp: new Date().toISOString(),
  };

  // 4. Invia (Pubblica) il messaggio su MQTT
  const message = JSON.stringify(payload);
  client.publish(TOPIC_SENSORS, message);

  console.log(`📡 Dati inviati su [${TOPIC_SENSORS}]:`, message);
}
