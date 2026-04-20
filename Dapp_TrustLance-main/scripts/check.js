require("dotenv").config();

function maskKey(key) {
  if (!key) return "(missing)";
  if (key.length <= 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function main() {
  const apiUrl = process.env.API_URL || process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;

  console.log("=== ENV CHECK ===");
  console.log("RPC URL     :", apiUrl || "(missing)");
  console.log("PRIVATE_KEY :", maskKey(privateKey));

  if (!apiUrl) {
    console.warn("⚠️ Missing API_URL or SEPOLIA_RPC_URL");
  }

  if (!privateKey) {
    console.warn("⚠️ Missing PRIVATE_KEY");
  }
}

main();