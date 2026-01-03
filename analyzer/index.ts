import * as mqtt from "mqtt";
import axios from "axios";

// Configurazione
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";
const INFLUX_URL = process.env.INFLUX_URL || "http://influxdb:8086/query";
const DATABASE_NAME = "olive_grove_db";

// Topics
const TOPIC_INTERNAL_MONITOR = "managed/monitor/weather"; // Input
const TOPIC_INTERNAL_SYMPTOM = "managed/analyze/symptom"; // Output

// Soglie (Knowledge)
const HUMIDITY_LOW = 30.0;
const HUMIDITY_OK = 35.0;
const TRAP_LIMIT = 50;
const TEMP_RISK = 3.0;
const TEMP_FREEZING = 0.0;
const MAX_DROP_RATE = 2.0;

console.log("🔍 [ANALYZER] Avvio servizio...");
const client = mqtt.connect(MQTT_BROKER_URL);

client.on("connect", () => {
  console.log("✅ [ANALYZER] Connesso");
  client.subscribe(TOPIC_INTERNAL_MONITOR);
});

client.on("message", async (topic, message) => {
  if (topic === TOPIC_INTERNAL_MONITOR) {
    const data = JSON.parse(message.toString());
    await analyze(data);
  }
});

async function analyze(data: any) {
  // 1. Analisi Umidità (Siccità)
  if (data.humidity < HUMIDITY_LOW) {
    publishSymptom("DROUGHT_DETECTED", {
      severity: "CRITICAL",
      value: data.humidity,
    });
  } else if (data.humidity >= HUMIDITY_OK) {
    publishSymptom("HUMIDITY_RESTORED", { value: data.humidity });
  }

  // 2. Analisi Parassiti
  if (data.trap_count > TRAP_LIMIT) {
    publishSymptom("PEST_INFESTATION", {
      count: data.trap_count,
      wind_speed: data.wind_speed, // passiamo anche la velocità del vento per i vincoli
    });
  } else if (data.trap_count < 10) {
    publishSymptom("PEST_CLEARED", {});
  }

  // 3. Analisi Gelo (Predittiva)
  if (data.temperature <= TEMP_FREEZING) {
    publishSymptom("FROST_DETECTED", { temp: data.temperature });
  } else if (data.temperature <= TEMP_RISK) {
    // Controllo InfluxDB per trend
    try {
      // 1. Prendiamo TUTTI i dati degli ultimi 30 minuti
      const query = `SELECT temperature FROM mqtt_consumer WHERE time >= now() - 30m ORDER BY time ASC`;
      
      const response = await axios.get(INFLUX_URL, {
        params: { q: query, db: DATABASE_NAME },
      });

      const values = response.data.results[0].series[0].values; // Array di [time, temp]

      // Ci servono almeno un po' di dati per fare una statistica sensata
      if (values.length > 10) {
        // 2. Calcoliamo la media dei PRIMI 5 rilevamenti (Start Window)
        //    Questo "pulisce" eventuali errori del sensore di 30 minuti fa
        const startWindow = values.slice(0, 5);
        const startAvg =
          startWindow.reduce((acc: number, curr: any) => acc + curr[1], 0) /
          startWindow.length;

        // 3. Calcoliamo la media degli ULTIMI 5 rilevamenti (End Window)
        //    Questo "pulisce" eventuali errori del sensore attuali
        const endWindow = values.slice(-5);
        const endAvg =
          endWindow.reduce((acc: number, curr: any) => acc + curr[1], 0) / endWindow.length;

        // 4. Calcolo del Rate
        //    Usiamo startAvg e endAvg che sono valori "puliti" e stabili
        const diff = startAvg - endAvg;
        const dropRate = diff / 0.5; // °C/h

        console.log(
          `Trend Analysis: StartAvg ${startAvg.toFixed(
            2
          )} -> EndAvg ${endAvg.toFixed(2)} | Rate: ${dropRate.toFixed(2)}`
        );

        if (dropRate > MAX_DROP_RATE) {
          publishSymptom("FROST_RISK_PREDICTED", {
            current_temp: endAvg, // Usiamo la media finale, è più affidabile del singolo dato
            drop_rate: dropRate,
          });
        }
      }
    } catch (e) {
      console.error("Errore lettura InfluxDB:", e instanceof Error ? e.message : String(e));
    }
  } else if (data.temperature > TEMP_RISK) {
    publishSymptom("FROST_RISK_CLEARED", {});
  }
}

function publishSymptom(type: string, details: any) {
  const payload = JSON.stringify({ type, ...details });
  console.log(`⚠️ [ANALYZER] Sintomo: ${type}`);
  client.publish(TOPIC_INTERNAL_SYMPTOM, payload);
}
