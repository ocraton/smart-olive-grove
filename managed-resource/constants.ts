// ==========================================
// TOPICS - Canali di comunicazione MQTT
// ==========================================
export const TOPIC_SENSOR_WEATHER = "oliveto/sensors/weather";
export const TOPIC_ACTUATOR_VALVE = "oliveto/actuators/drip_valve";
export const TOPIC_ACTUATOR_ANTIFROST = "oliveto/actuators/antifrost_valve";
export const TOPIC_ACTUATOR_NEBULIZER = "oliveto/actuators/nebulizer_pump";

// ==========================================
// CONFIGURAZIONE CONNESSIONI
// ==========================================
export const MQTT_BROKER_URL = "mqtt://localhost:1883";
export const INFLUX_URL = "http://localhost:8086/query";
export const DATABASE_NAME = "olive_grove_db";

// ==========================================
// KNOWLEDGE - Soglie e Regole
// ==========================================

// Scenario A: Idratazione
export const HUMIDITY_THRESHOLD_CRITICAL = 30.0; // Sotto il 30% irriga
export const HUMIDITY_THRESHOLD_TARGET = 35.0;   // Smetti quando arrivi al 35% (isteresi)

// Scenario B: Pest Control (Mosca)
export const TRAP_THRESHOLD_RISK = 50;  // Sopra 50 insetti serve trattamento
export const WIND_SAFE_LIMIT = 15.0;    // Sopra 15 km/h non si può spruzzare (Drift)

// Scenario C: Protezione Gelo
export const TEMP_RISK_ZONE = 3.0;      // Sotto 3°C inizia zona di rischio
export const TEMP_FREEZING = 0.0;       // Soglia gelo
export const MAX_DROP_RATE = 2.0;       // °C/ora - Velocità critica di raffreddamento
