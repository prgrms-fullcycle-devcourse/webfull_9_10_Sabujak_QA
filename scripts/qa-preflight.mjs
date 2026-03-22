import dotenv from "dotenv";

dotenv.config();

const required = [
  "APP_BASE_URL",
  "API_BASE_URL",
  "TEST_CAPSULE_SLUG",
  "TEST_ADMIN_PASSWORD",
];

const optional = ["QA_ENV", "PLAYWRIGHT_OUTPUT_DIR"];
const missing = required.filter((key) => !process.env[key]);
const qaEnv = process.env.QA_ENV || "staging";

if (missing.length > 0) {
  console.error("QA preflight failed.");
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("QA preflight passed.");
console.log(`QA_ENV=${qaEnv}`);
for (const key of required) {
  console.log(`${key}=configured`);
}
for (const key of optional) {
  console.log(`${key}=${process.env[key] || "(default)"}`);
}
