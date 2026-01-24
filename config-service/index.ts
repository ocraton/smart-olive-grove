import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// --- CONFIGURAZIONE DINAMICA ETERARCHICA ---
const CONFIGURATION = {
  settings: {
    system_name: "Smart Olive Grove - Dynamic Loops",
    check_interval_ms: 5000,
  },

  // 1. DEVICE CATALOG (Topologia Fisica)
  devices: {
    sensors: [{ id: "weather_station_1", topic: "oliveto/sector_a/weather" }],
    actuators: [
      { id: "drip_valve_main", topic: "oliveto/sector_a/drip_valve" },
      { id: "nebulizer_pump", topic: "oliveto/sector_a/nebulizer" },
      { id: "antifrost_emitter", topic: "oliveto/sector_a/antifrost" },
    ],
  },

  // 2. CONTROL LOOPS (Logica Many-to-Many)
  loops: [
    {
      id: "loop_hydration_protection",
      description: "Irrigazione standard se secco",
      priority: 1, // Bassa priorità
      enabled: true,
      inputs: ["weather_station_1"],
      condition: {
        field: "humidity",
        operator: "<",
        threshold: 30.0,
      },
      actions: {
        on_true: { target_actuators: ["drip_valve_main"], command: "ON" },
        on_false: { target_actuators: ["drip_valve_main"], command: "OFF" },
      },
    },

    {
      id: "loop_pest_control_smart",
      description: "Trattamento parassiti con Override Temporale",
      priority: 5, // Media priorità
      enabled: true,
      inputs: ["weather_station_1"],

      // LOGICA: (Insetti > 50) AND [ (Vento < 15) OR (TempoAttesa > 30 min) ]
      condition: {
        logic: "AND",
        conditions: [
          { field: "trap_count", operator: ">", threshold: 50 },
          {
            logic: "OR",
            conditions: [
              { field: "wind_speed", operator: "<", threshold: 15.0 },
              // RITORNIAMO AL VALORE REALISTICO: 30 Minuti di attesa
              { field: "EXT_INFLUX_DELAY", operator: ">", threshold: 30 },
            ],
          },
        ],
      },
      actions: {
        on_true: { target_actuators: ["nebulizer_pump"], command: "ON" },
        on_false: { target_actuators: ["nebulizer_pump"], command: "OFF" },
      },
    },

    {
      id: "loop_storm_safety",
      description: "Sicurezza Vento: Chiude TUTTO se c'è tempesta",
      priority: 10, // ALTA priorità
      enabled: true,
      inputs: ["weather_station_1"],
      condition: {
        field: "wind_speed",
        operator: ">",
        threshold: 40.0,
      },
      actions: {
        on_true: {
          target_actuators: ["drip_valve_main", "nebulizer_pump"],
          command: "OFF",
        },
        on_false: { target_actuators: [], command: "NO_OP" },
      },
    },

    {
      id: "loop_frost_protection",
      description: "Antigelo: Sotto zero O discesa rapida",
      priority: 8,
      enabled: true,
      inputs: ["weather_station_1"],
      condition: {
        logic: "OR",
        conditions: [
          { field: "temperature", operator: "<=", threshold: 0.0 },
          // Predizione basata sul drop rate > 2.0 °C/h
          { field: "EXT_TEMP_DROP_RATE", operator: ">", threshold: 2.0 },
        ],
      },
      actions: {
        on_true: { target_actuators: ["antifrost_emitter"], command: "ON" },
        on_false: { target_actuators: ["antifrost_emitter"], command: "OFF" },
      },
    },
  ],

  internal_topics: {
    monitor: "managed/monitor/data",
    symptom: "managed/analyze/symptom",
    plan: "managed/plan/command",
  },
};

console.log(`[CONFIG-SERVICE] Avvio servizio sulla porta ${PORT}...`);

app.get("/config", (req: Request, res: Response) => {
  res.json(CONFIGURATION);
});

app.listen(PORT, () => {
  console.log(`✅ [CONFIG-SERVICE] In ascolto su http://localhost:${PORT}`);
});
