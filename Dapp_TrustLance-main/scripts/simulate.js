const hre = require("hardhat");
const { ethers } = hre;
const deployment = require("../deployments/localhost.json");

async function main() {
  const [company, worker, arbiter1, arbiter2, arbiter3] =
    await ethers.getSigners();

  console.log("=== ACTORS ===");
  console.log("Company   :", company.address);
  console.log("Worker    :", worker.address);
  console.log("Arbiter 1 :", arbiter1.address);
  console.log("Arbiter 2 :", arbiter2.address);
  console.log("Arbiter 3 :", arbiter3.address);

  const ticket = await ethers.getContractAt(
    "TicketEscrow",
    deployment.demoTicket
  );

  const multisig = await ethers.getContractAt(
    "DisputeMultiSig",
    deployment.multisig
  );

  /* --------------------------------------------------
   * 1. Worker claims ticket
   * -------------------------------------------------- */
  console.log("\n1️⃣ Worker claims ticket");
  await (await ticket.connect(worker).claimTicket()).wait();
  console.log("✅ Ticket claimed");

  /* --------------------------------------------------
   * 2. Worker submits proof
   * -------------------------------------------------- */
  console.log("\n2️⃣ Worker submits proof");
  const proofCID = "ipfs://demo-proof-image-cid";
  const proofNote = "Completed installation and uploaded site photos";

  await (await ticket.connect(worker).submitProof(proofCID, proofNote)).wait();
  console.log("✅ Proof submitted");

  /* --------------------------------------------------
   * 3. Company opens dispute
   * -------------------------------------------------- */
  console.log("\n3️⃣ Company opens dispute");
  await (await ticket.connect(company).disputeByCompany()).wait();
  console.log("⚠️ Dispute opened");

  /* --------------------------------------------------
   * 4. Arbiters vote (2/3 -> PAY worker)
   * -------------------------------------------------- */
  console.log("\n4️⃣ Arbiters vote");

  await (await multisig.connect(arbiter1).vote(deployment.demoTicket, true)).wait();
  console.log("🗳️ Arbiter1 voted PAY worker");

  await (await multisig.connect(arbiter2).vote(deployment.demoTicket, true)).wait();
  console.log("🗳️ Arbiter2 voted PAY worker");

  /* --------------------------------------------------
   * 5. Final checks
   * -------------------------------------------------- */
  const [forWorker, forCompany, resolved] = await multisig.getVotes(
    deployment.demoTicket
  );

  const status = await ticket.status();
  const balance = await ethers.provider.getBalance(worker.address);

  console.log("\n=== FINAL RESULT ===");
  console.log("Votes for worker :", forWorker.toString());
  console.log("Votes for company:", forCompany.toString());
  console.log("Resolved         :", resolved);
  console.log("Ticket status    :", status.toString());
  console.log("Worker balance   :", ethers.formatEther(balance), "ETH");

  console.log("\n🎉 FULL TICKET → DISPUTE FLOW COMPLETED");
}

main().catch((error) => {
  console.error("\n❌ Simulation failed");
  console.error(error);
  process.exit(1);
});