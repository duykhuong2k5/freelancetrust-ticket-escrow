const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketEscrow + DisputeMultiSig - End-to-End Flow", function () {
  let deployer, company, worker, arbiter1, arbiter2, arbiter3, randomUser;
  let board, multisig;
  let ticket, ticketAddr;

  const REQUIRED_VOTES = 2;
  const ONE_DAY = 24 * 60 * 60;
  const TITLE = "Audit display at branch";
  const DETAILS_CID = "ipfs://flow-ticket";
  const PROOF_CID = "ipfs://flow-proof";
  const PROOF_NOTE = "Photos uploaded";

  beforeEach(async function () {
    [deployer, company, worker, arbiter1, arbiter2, arbiter3, randomUser] =
      await ethers.getSigners();

    const DisputeMultiSig = await ethers.getContractFactory("DisputeMultiSig");
    multisig = await DisputeMultiSig.deploy(
      [arbiter1.address, arbiter2.address, arbiter3.address],
      REQUIRED_VOTES
    );
    await multisig.waitForDeployment();

    const TicketBoard = await ethers.getContractFactory("TicketBoard");
    board = await TicketBoard.deploy(await multisig.getAddress());
    await board.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3 * ONE_DAY;

    const tx = await board
      .connect(company)
      .createTicket(TITLE, DETAILS_CID, deadline, {
        value: ethers.parseEther("1"),
      });

    const receipt = await tx.wait();
    const event = receipt.logs.find((l) => l.fragment?.name === "TicketCreated");
    ticketAddr = event.args.escrow;

    ticket = await ethers.getContractAt("TicketEscrow", ticketAddr);
  });

  it("✅ Any non-company user can claim ticket (first-come)", async function () {
    await expect(ticket.connect(worker).claimTicket()).to.not.be.reverted;
  });

  it("❌ Cannot claim ticket twice", async function () {
    await ticket.connect(worker).claimTicket();

    await expect(ticket.connect(randomUser).claimTicket()).to.be.revertedWith(
      "Ticket not open"
    );
  });

  it("✅ Worker claims and submits proof", async function () {
    await ticket.connect(worker).claimTicket();

    await expect(
      ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE)
    ).to.not.be.reverted;
  });

  it("✅ Happy path: company approves submission and pays worker", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

    await expect(ticket.connect(company).approveSubmission()).to.not.be.reverted;
    expect(await ticket.status()).to.equal(4); // Paid
  });

  it("❌ Cannot dispute before submission", async function () {
    await ticket.connect(worker).claimTicket();

    await expect(
      ticket.connect(company).disputeByCompany()
    ).to.be.revertedWith("Not submitted");
  });

  it("✅ Company can dispute immediately after submission", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

    await expect(
      ticket.connect(company).disputeByCompany()
    ).to.not.be.reverted;

    expect(await ticket.status()).to.equal(3); // Disputed
  });

  it("✅ Worker can dispute after deadline if company does not respond", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

    await ethers.provider.send("evm_increaseTime", [4 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      ticket.connect(worker).disputeByWorker()
    ).to.not.be.reverted;

    expect(await ticket.status()).to.equal(3); // Disputed
  });

  it("🧑‍⚖️ 2/3 arbiters vote -> worker wins", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
    await ticket.connect(company).disputeByCompany();

    await multisig.connect(arbiter1).vote(ticketAddr, true);
    await multisig.connect(arbiter2).vote(ticketAddr, true);

    const [, , resolved] = await multisig.getVotes(ticketAddr);
    expect(resolved).to.equal(true);
    expect(await ticket.status()).to.equal(4); // Paid
  });

  it("🧑‍⚖️ 2/3 arbiters vote -> company refunded", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
    await ticket.connect(company).disputeByCompany();

    await multisig.connect(arbiter1).vote(ticketAddr, false);
    await multisig.connect(arbiter2).vote(ticketAddr, false);

    const [, , resolved] = await multisig.getVotes(ticketAddr);
    expect(resolved).to.equal(true);
    expect(await ticket.status()).to.equal(5); // Refunded
  });

  it("❌ Arbiter cannot vote twice", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
    await ticket.connect(company).disputeByCompany();

    await multisig.connect(arbiter1).vote(ticketAddr, true);

    await expect(
      multisig.connect(arbiter1).vote(ticketAddr, true)
    ).to.be.revertedWith("Already voted");
  });

  it("❌ Non-arbiter cannot vote", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
    await ticket.connect(company).disputeByCompany();

    await expect(
      multisig.connect(company).vote(ticketAddr, true)
    ).to.be.revertedWith("Not an arbiter");
  });

  it("❌ Cannot resolve dispute twice", async function () {
    await ticket.connect(worker).claimTicket();
    await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
    await ticket.connect(company).disputeByCompany();

    await multisig.connect(arbiter1).vote(ticketAddr, true);
    await multisig.connect(arbiter2).vote(ticketAddr, true);

    await expect(
      multisig.connect(arbiter3).vote(ticketAddr, true)
    ).to.be.revertedWith("Dispute already resolved");
  });
});