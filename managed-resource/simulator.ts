import * as mqtt from "mqtt";
import axios from "axios";

const CONFIG_SERVICE_URL =
  process.env.CONFIG_SERVICE_URL || "http://config-server:4000/config";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://mosquitto:1883";

// Initial Physical State (Balanced Start)
let physics = {
  temperature: 22.0,
  humidity: 45.0,
  wind_speed: 10.0, // Start with a SAFE wind speed (< 15)
  trap_count: 30, // Start with LOW infestation (< 50)
};

// Dynamic Actuator State
const actuatorsState: { [key: string]: string } = {};

console.log(`🌱 [SIMULATOR] Starting Digital Twin Service...`);

async function fetchConfigWithRetry() {
  let attempts = 0;
  while (true) {
    try {
      const response = await axios.get(CONFIG_SERVICE_URL);
      console.log("📥 [SIMULATOR] Configuration received from Config Service.");
      return response.data;
    } catch (error) {
      attempts++;
      console.warn(
        `⚠️ [SIMULATOR] Config Service unreachable (Attempt ${attempts}). Retrying in 3s...`,
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
    console.log("✅ [SIMULATOR] Connected to MQTT Broker");

    // Dynamic subscription to all actuators defined in the topology
    devices.actuators.forEach((act: any) => {
      console.log(`🔌 Subscribing to actuator topic: ${act.topic}`);
      client.subscribe(act.topic);
      actuatorsState[act.id] = "OFF"; // Initialize state
    });

    // Start the physics simulation loop
    setInterval(
      () => simulationLoop(client, devices.sensors, devices.actuators),
      5000,
    );
  });

  client.on("message", (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());

      // Only process explicit commands from the Executor
      if (!payload.command) return;

      const actuator = devices.actuators.find((a: any) => a.topic === topic);

      if (actuator) {
        // Update internal state
        actuatorsState[actuator.id] = payload.command;
        console.log(
          `⚙️ [ACTUATOR STATE UPDATE] ${actuator.id} -> ${payload.command}`,
        );

        // Physics Feedback (Actuators affecting the environment)
        if (actuator.id === "drip_valve_main" && payload.command === "ON") {
          physics.humidity = Math.min(100, physics.humidity + 5);
        }
        if (actuator.id === "nebulizer_pump" && payload.command === "ON") {
          // Pesticide reduces bug count drastically
          physics.trap_count = Math.max(0, physics.trap_count - 5);
        }
        if (actuator.id === "antifrost_emitter" && payload.command === "ON") {
          // Heater increases temperature
          physics.temperature += 2.0;
        }
      }
    } catch (e) {
      // Ignore errors
    }
  });
}

function simulationLoop(
  client: mqtt.MqttClient,
  sensors: any[],
  actuators: any[],
) {
  const timestamp = new Date().toISOString();

  // 1. Natural Physics Evolution (Random Walk)
  // This makes the system look "alive" in the logs/dashboard
  physics.temperature += (Math.random() - 0.5) * 0.5; // Fluctuate +/- 0.25 deg
  physics.wind_speed += (Math.random() - 0.5) * 2.0; // Fluctuate +/- 1.0 km/h
  physics.humidity += (Math.random() - 0.5) * 2.0; // Fluctuate humidity

  // Natural pest growth (slowly increases if not treated)
  if (Math.random() > 0.7) physics.trap_count += 1;

  // Clamping values to realistic limits
  physics.wind_speed = Math.max(0, physics.wind_speed);
  physics.humidity = Math.max(0, Math.min(100, physics.humidity));

  // 2. Publish Sensor Data
  sensors.forEach((sensor: any) => {
    const payload = {
      sensor_id: sensor.id,
      ...physics,
      timestamp,
    };
    client.publish(sensor.topic, JSON.stringify(payload));
  });

  // 3. Publish Actuator State (Feedback)
  actuators.forEach((act: any) => {
    const currentState = actuatorsState[act.id] || "OFF";
    const payload = {
      value: currentState,
      timestamp: timestamp,
    };
    client.publish(act.topic, JSON.stringify(payload));
  });
}

startSimulator();
