import config from "@incanta/config";
import { Gpio } from "onoff";
import mqtt from "mqtt";

const wallSwitch = new Gpio(17, "in", "rising"); // pin 11, 6th on the left
const fireplaceSwitch = new Gpio(27, "out"); // pin 13, 7th on the left

let fireplaceOn = false;

function exitHandler() {
  wallSwitch.unexport();
  fireplaceSwitch.unexport();
  process.exit();
}

process.on("exit", exitHandler);
process.on("SIGINT", exitHandler);
process.on("SIGUSR1", exitHandler);
process.on("SIGUSR2", exitHandler);

const mqttClient = mqtt.connect({
  host: config.get<string>("mqtt.host"),
  port: config.get<number>("mqtt.port"),
  username: config.get<string>("mqtt.username"),
  password: config.get<string>("mqtt.password"),
});

console.log("Connecting to MQTT...");

await new Promise<void>((resolve) => {
  mqttClient.on("connect", () => {
    resolve();
  });
});

console.log("Connected to MQTT");

const id = "fireplace";
const stateTopic = id;
const commandTopic = `${stateTopic}/set`;

async function update() {
  console.log(`Fireplace is ${fireplaceOn ? "ON" : "OFF"}`);

  if (fireplaceOn) {
    fireplaceSwitch.writeSync(1);
  } else {
    fireplaceSwitch.writeSync(0);
  }

  await mqttClient.publishAsync(stateTopic, fireplaceOn ? "ON" : "OFF", {
    retain: true,
  });
}

mqttClient.subscribe(commandTopic);

mqttClient.on("message", async (topic, message) => {
  if (topic === commandTopic) {
    const value = message.toString();
    if (value === "ON") {
      fireplaceOn = true;
    } else if (value === "OFF") {
      fireplaceOn = false;
    }
    await update();
  }
});

await mqttClient.publishAsync(
  `homeassistant/switch/${id}/config`,
  JSON.stringify({
    unique_id: id,
    name: "Fireplace",
    state_topic: stateTopic,
    command_topic: commandTopic,
    retain: true,
  }),
  { retain: true },
);

wallSwitch.watch(async (err) => {
  if (err) {
    console.error(
      `Error with wallSwitch callback:\n${JSON.stringify(err, null, 2)}`,
    );
  } else {
    fireplaceOn = !fireplaceOn;
    await update();
  }
});
