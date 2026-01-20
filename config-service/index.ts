import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// CONFIGURAZIONE CENTRALIZZATA
const CONFIGURATION = {
  // 1. KNOWLEDGE (Regole e Soglie)
  knowledge: {
    // Scenario A: Idratazione
    humidity_low: 30.0,
    humidity_ok: 35.0,

    // Scenario B: Pest Control
    pest_trap_limit: 50,
    pest_trap_critical_limit: 70,
    wind_safe_limit: 15.0,
    postpone_delay_minutes: 30, // Minuti di attesa

    // Scenario C: Gelo
    temp_risk: 3.0,
    temp_freezing: 0.0,
    temp_max_drop_rate: 2.0,
  },

  // 2. TOPOLOGY (Mappa dei Topic MQTT)
  topics: {
    // Comunicazione con il mondo esterno (Sensori/Attuatori)
    sensor_weather: "oliveto/sensors/weather",
    actuator_valve: "oliveto/actuators/drip_valve",
    actuator_antifrost: "oliveto/actuators/antifrost_valve",
    actuator_nebulizer: "oliveto/actuators/nebulizer_pump",

    // Comunicazione Interna (MAPE Loop)
    internal_monitor: "managed/monitor/weather",
    internal_symptom: "managed/analyze/symptom",
    internal_plan: "managed/plan/command",
  },

  settings: {
    system_name: "Smart Olive Grove Manager v2.1 (Dynamic)",
  },
};

console.log(`[CONFIG-SERVICE] Avvio servizio sulla porta ${PORT}...`);

app.get("/config", (req: Request, res: Response) => {
  // console.log(`📥 [CONFIG] Richiesta da: ${req.ip}`); // Scommenta per debug verbose
  res.json(CONFIGURATION);
});

app.listen(PORT, () => {
  console.log(`✅ [CONFIG-SERVICE] In ascolto su http://localhost:${PORT}`);
});
