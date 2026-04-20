const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Edge Cases & Security Tests", function () {
  let deployer, company, worker, arbiter1, arbiter2, arbiter3, randomUser;
  let board, multisig;
  let ticket, ticketAddr;

  const REQUIRED_VOTES = 2;
  const ONE_DAY = 24 * 60 * 60;
  const TICKET_VALUE = ethers.parseEther("1");
  const TITLE = "Merchandising task";
  const DETAILS_CID = "ipfs://edge-details";
  const PROOF_CID = "ipfs://edge-proof";
  const PROOF_NOTE = "Done";

  async function createTicket() {
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3 * ONE_DAY;

    const tx = await board
      .connect(company)
      .createTicket(TITLE, DETAILS_CID, deadline, { value: TICKET_VALUE });

    const receipt = await tx.wait();
    const event = receipt.logs.find((l) => l.fragment?.name === "TicketCreated");
    const addr = event.args.escrow;
    const instance = await ethers.getContractAt("TicketEscrow", addr);

    return { addr, instance, deadline };
  }

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
  });

  describe("Direct TicketEscrow Deployment (Security)", function () {
    it("❌ Non-deployer cannot init ticket directly", async function () {
      const TicketEscrow = await ethers.getContractFactory("TicketEscrow");
      const directTicket = await TicketEscrow.deploy();
      await directTicket.waitForDeployment();

      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      await expect(
        directTicket
          .connect(company)
          .init(company.address, deadline, TITLE, DETAILS_CID, {
            value: TICKET_VALUE,
          })
      ).to.be.revertedWith("Only factory");
    });

    it("❌ Non-deployer cannot setArbiter directly", async function () {
      const TicketEscrow = await ethers.getContractFactory("TicketEscrow");
      const directTicket = await TicketEscrow.deploy();
      await directTicket.waitForDeployment();

      await expect(
        directTicket.connect(company).setArbiter(await multisig.getAddress())
      ).to.be.revertedWith("Only factory");
    });

    it("❌ Cannot init ticket twice", async function () {
      const TicketEscrow = await ethers.getContractFactory("TicketEscrow");
      const directTicket = await TicketEscrow.deploy();
      await directTicket.waitForDeployment();

      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      await directTicket.init(deployer.address, deadline, TITLE, DETAILS_CID, {
        value: TICKET_VALUE,
      });

      await expect(
        directTicket.init(deployer.address, deadline + ONE_DAY, TITLE, DETAILS_CID, {
          value: TICKET_VALUE,
        })
      ).to.be.revertedWith("Already initialized");
    });

    it("❌ Cannot setArbiter twice", async function () {
      const TicketEscrow = await ethers.getContractFactory("TicketEscrow");
      const directTicket = await TicketEscrow.deploy();
      await directTicket.waitForDeployment();

      await directTicket.setArbiter(await multisig.getAddress());

      await expect(
        directTicket.setArbiter(arbiter1.address)
      ).to.be.revertedWith("Arbiter already set");
    });
  });

  describe("Payment Integrity", function () {
    it("✅ Payment to worker completes atomically", async function () {
      const created = await createTicket();
      ticket = created.instance;
      ticketAddr = created.addr;

      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      const balanceBefore = await ethers.provider.getBalance(worker.address);
      await ticket.connect(company).approveSubmission();
      const balanceAfter = await ethers.provider.getBalance(worker.address);

      expect(balanceAfter - balanceBefore).to.equal(TICKET_VALUE);
      expect(await ethers.provider.getBalance(ticketAddr)).to.equal(0);
      expect(await ticket.status()).to.equal(4); // Paid
    });
  });

  describe("Event Emissions", function () {
    beforeEach(async function () {
      const created = await createTicket();
      ticket = created.instance;
      ticketAddr = created.addr;
    });

    it("✅ TicketClaimed event emitted correctly", async function () {
      await expect(ticket.connect(worker).claimTicket()).to.emit(
        ticket,
        "TicketClaimed"
      );
    });

    it("✅ ProofSubmitted event emitted correctly", async function () {
      await ticket.connect(worker).claimTicket();
      await expect(
        ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE)
      ).to.emit(ticket, "ProofSubmitted");
    });

    it("✅ SubmissionRejected event emitted correctly", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await expect(
        ticket.connect(company).requestResubmission("Need clearer photos")
      ).to.emit(ticket, "SubmissionRejected");
    });

    it("✅ DisputeOpened event emitted correctly", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await expect(ticket.connect(company).disputeByCompany())
        .to.emit(ticket, "DisputeOpened")
        .withArgs(company.address);
    });

    it("✅ Paid event emitted on approval", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await expect(ticket.connect(company).approveSubmission())
        .to.emit(ticket, "Paid")
        .withArgs(worker.address, TICKET_VALUE);
    });

    it("✅ Paid event emitted on dispute resolution (worker wins)", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket.connect(company).disputeByCompany();

      await multisig.connect(arbiter1).vote(ticketAddr, true);

      await expect(multisig.connect(arbiter2).vote(ticketAddr, true))
        .to.emit(ticket, "Paid")
        .withArgs(worker.address, TICKET_VALUE);
    });

    it("✅ Refunded event emitted on dispute resolution (company wins)", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket.connect(company).disputeByCompany();

      await multisig.connect(arbiter1).vote(ticketAddr, false);

      await expect(multisig.connect(arbiter2).vote(ticketAddr, false))
        .to.emit(ticket, "Refunded")
        .withArgs(company.address, TICKET_VALUE);
    });

    it("✅ TicketCancelled event emitted correctly", async function () {
      const created2 = await createTicket();
      const ticket2 = created2.instance;

      await expect(ticket2.connect(company).cancelOpenTicket())
        .to.emit(ticket2, "TicketCancelled")
        .withArgs(company.address, TICKET_VALUE);
    });
  });

  describe("Boundary Conditions", function () {
    it("✅ Can create ticket with minimum value (1 wei)", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      await expect(
        board.connect(company).createTicket("Min", "ipfs://min", deadline, {
          value: 1,
        })
      ).to.not.be.reverted;
    });

    it("✅ Can create ticket with large value", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;
      const largeValue = ethers.parseEther("1000");

      await expect(
        board.connect(company).createTicket("Big", "ipfs://big", deadline, {
          value: largeValue,
        })
      ).to.not.be.reverted;
    });

    it("✅ Deadline can be exactly 1 second in future", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 2;

      await expect(
        board.connect(company).createTicket("Soon", "ipfs://soon", deadline, {
          value: TICKET_VALUE,
        })
      ).to.not.be.reverted;
    });

    it("✅ Worker can dispute at deadline boundary + 1 second", async function () {
      const created = await createTicket();
      ticket = created.instance;

      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await ethers.provider.send("evm_increaseTime", [4 * ONE_DAY]);
      await ethers.provider.send("evm_mine", []);

      await expect(ticket.connect(worker).disputeByWorker()).to.not.be.reverted;
    });
  });

  describe("Multiple Arbiter Scenarios", function () {
    it("✅ 1 of 1 arbiter setup works", async function () {
      const DisputeMultiSig = await ethers.getContractFactory("DisputeMultiSig");
      const singleArbiterMultisig = await DisputeMultiSig.deploy(
        [arbiter1.address],
        1
      );
      await singleArbiterMultisig.waitForDeployment();

      const TicketBoard = await ethers.getContractFactory("TicketBoard");
      const singleBoard = await TicketBoard.deploy(
        await singleArbiterMultisig.getAddress()
      );
      await singleBoard.waitForDeployment();

      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      const tx = await singleBoard
        .connect(company)
        .createTicket(TITLE, DETAILS_CID, deadline, { value: TICKET_VALUE });
      const receipt = await tx.wait();
      const ticketAddr1 = receipt.logs.find(
        (l) => l.fragment?.name === "TicketCreated"
      ).args.escrow;

      const ticket1 = await ethers.getContractAt("TicketEscrow", ticketAddr1);

      await ticket1.connect(worker).claimTicket();
      await ticket1.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket1.connect(company).disputeByCompany();

      await singleArbiterMultisig.connect(arbiter1).vote(ticketAddr1, true);

      expect(await ticket1.status()).to.equal(4); // Paid
    });

    it("✅ 3 of 3 arbiter setup requires all votes", async function () {
      const DisputeMultiSig = await ethers.getContractFactory("DisputeMultiSig");
      const fullConsensusMultisig = await DisputeMultiSig.deploy(
        [arbiter1.address, arbiter2.address, arbiter3.address],
        3
      );
      await fullConsensusMultisig.waitForDeployment();

      const TicketBoard = await ethers.getContractFactory("TicketBoard");
      const consensusBoard = await TicketBoard.deploy(
        await fullConsensusMultisig.getAddress()
      );
      await consensusBoard.waitForDeployment();

      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      const tx = await consensusBoard
        .connect(company)
        .createTicket(TITLE, DETAILS_CID, deadline, { value: TICKET_VALUE });
      const receipt = await tx.wait();
      const consensusTicketAddr = receipt.logs.find(
        (l) => l.fragment?.name === "TicketCreated"
      ).args.escrow;

      const consensusTicket = await ethers.getContractAt(
        "TicketEscrow",
        consensusTicketAddr
      );

      await consensusTicket.connect(worker).claimTicket();
      await consensusTicket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await consensusTicket.connect(company).disputeByCompany();

      await fullConsensusMultisig.connect(arbiter1).vote(consensusTicketAddr, true);
      await fullConsensusMultisig.connect(arbiter2).vote(consensusTicketAddr, true);

      const [, , resolved1] = await fullConsensusMultisig.getVotes(consensusTicketAddr);
      expect(resolved1).to.equal(false);

      await fullConsensusMultisig.connect(arbiter3).vote(consensusTicketAddr, true);

      expect(await consensusTicket.status()).to.equal(4); // Paid
    });
  });

  describe("State Transitions", function () {
    beforeEach(async function () {
      const created = await createTicket();
      ticket = created.instance;
      ticketAddr = created.addr;
    });

    it("✅ Open -> Claimed -> Submitted -> Paid (happy path)", async function () {
      expect(await ticket.status()).to.equal(0); // Open

      await ticket.connect(worker).claimTicket();
      expect(await ticket.status()).to.equal(1); // Claimed

      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      expect(await ticket.status()).to.equal(2); // Submitted

      await ticket.connect(company).approveSubmission();
      expect(await ticket.status()).to.equal(4); // Paid
    });

    it("✅ Open -> Claimed -> Submitted -> Claimed -> Submitted -> Paid", async function () {
      await ticket.connect(worker).claimTicket();
      expect(await ticket.status()).to.equal(1);

      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      expect(await ticket.status()).to.equal(2);

      await ticket.connect(company).requestResubmission("Retake photo");
      expect(await ticket.status()).to.equal(1);

      await ticket.connect(worker).submitProof("ipfs://proof-2", "Retaken");
      expect(await ticket.status()).to.equal(2);

      await ticket.connect(company).approveSubmission();
      expect(await ticket.status()).to.equal(4);
    });

    it("✅ Open -> Cancelled", async function () {
      await ticket.connect(company).cancelOpenTicket();
      expect(await ticket.status()).to.equal(6); // Cancelled
    });

    it("✅ Open -> Claimed -> Submitted -> Disputed -> Paid", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket.connect(company).disputeByCompany();
      expect(await ticket.status()).to.equal(3); // Disputed

      await multisig.connect(arbiter1).vote(ticketAddr, true);
      await multisig.connect(arbiter2).vote(ticketAddr, true);

      expect(await ticket.status()).to.equal(4); // Paid
    });

    it("✅ Open -> Claimed -> Submitted -> Disputed -> Refunded", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket.connect(company).disputeByCompany();
      expect(await ticket.status()).to.equal(3); // Disputed

      await multisig.connect(arbiter1).vote(ticketAddr, false);
      await multisig.connect(arbiter2).vote(ticketAddr, false);

      expect(await ticket.status()).to.equal(5); // Refunded
    });

    it("❌ Cannot skip states", async function () {
      await expect(
        ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE)
      ).to.be.revertedWith("Not worker");

      await expect(
        ticket.connect(company).approveSubmission()
      ).to.be.revertedWith("Not submitted");
    });
  });

  describe("Board Ticket Tracking", function () {
    it("✅ Tickets array and mappings stay consistent after multiple operations", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      const ticketAddresses = [];
      for (let i = 0; i < 5; i++) {
        const tx = await board
          .connect(company)
          .createTicket(`Task ${i}`, `ipfs://task-${i}`, deadline, {
            value: TICKET_VALUE,
          });
        const receipt = await tx.wait();
        const event = receipt.logs.find((l) => l.fragment?.name === "TicketCreated");
        ticketAddresses.push(event.args.escrow);
      }

      expect(await board.totalTickets()).to.equal(5);

      const allTickets = await board.getAllTickets();
      expect(allTickets.length).to.equal(5);

      for (let i = 0; i < 5; i++) {
        expect(await board.getTicket(i)).to.equal(ticketAddresses[i]);
        expect(await board.tickets(i)).to.equal(ticketAddresses[i]);
        expect(allTickets[i]).to.equal(ticketAddresses[i]);
      }

      const companyTickets = await board.getTicketsByCompany(company.address);
      expect(companyTickets.length).to.equal(5);

      const firstTicket = await ethers.getContractAt("TicketEscrow", ticketAddresses[0]);
      await firstTicket.connect(worker).claimTicket();

      const workerTickets = await board.getTicketsByWorker(worker.address);
      expect(workerTickets.length).to.equal(1);
      expect(workerTickets[0]).to.equal(ticketAddresses[0]);
    });
  });
});