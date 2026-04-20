const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, arbiter1, arbiter2, arbiter3] = await ethers.getSigners();

  console.log("🚀 Deploying with:", deployer.address);

  /* --------------------------------------------------
   * 1. Deploy DisputeMultiSig
   * -------------------------------------------------- */
  const arbiters = [
    arbiter1.address,
    arbiter2.address,
    arbiter3.address,
  ];
  const required = 2;

  const DisputeMultiSig = await ethers.getContractFactory("DisputeMultiSig");
  const multisig = await DisputeMultiSig.deploy(arbiters, required);
  await multisig.waitForDeployment();

  const multisigAddress = await multisig.getAddress();
  console.log("✅ DisputeMultiSig deployed:", multisigAddress);

  /* --------------------------------------------------
   * 2. Deploy TicketBoard
   * -------------------------------------------------- */
  const TicketBoard = await ethers.getContractFactory("TicketBoard");
  const board = await TicketBoard.deploy(multisigAddress);
  await board.waitForDeployment();

  const boardAddress = await board.getAddress();
  console.log("✅ TicketBoard deployed:", boardAddress);

  /* --------------------------------------------------
   * 3. Create demo ticket
   * -------------------------------------------------- */
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // +7 days
  const amount = ethers.parseEther("1");
  const title = "Demo Ticket - Install POSM";
  const detailsCID = "ipfs://demo-ticket-details-cid";

  const tx = await board.createTicket(title, detailsCID, deadline, {
    value: amount,
  });
  const receipt = await tx.wait();

  const event = receipt.logs.find(
    (l) => l.fragment?.name === "TicketCreated"
  );

  if (!event) {
    throw new Error("TicketCreated event not found");
  }

  const ticketAddress = event.args.escrow;
  console.log("📄 Demo Ticket created:", ticketAddress);

  /* --------------------------------------------------
   * 4. Save deployment info
   * -------------------------------------------------- */
  const deployment = {
    board: boardAddress,
    multisig: multisigAddress,
    demoTicket: ticketAddress,
    arbiters,
    required,
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "localhost.json"),
    JSON.stringify(deployment, null, 2)
  );

  console.log("\n🎉 DEPLOY COMPLETED");
  console.log(deployment);
}

main().catch((error) => {
  console.error("❌ Deployment failed");
  console.error(error);
  process.exitCode = 1;
});