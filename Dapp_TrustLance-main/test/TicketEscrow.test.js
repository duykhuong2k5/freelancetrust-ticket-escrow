const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketEscrow - Comprehensive Tests", function () {
  let deployer, company, worker, arbiter1, arbiter2, arbiter3, randomUser;
  let board, multisig;
  let ticket, ticketAddr;

  const REQUIRED_VOTES = 2;
  const ONE_DAY = 24 * 60 * 60;
  const TICKET_VALUE = ethers.parseEther("1");
  const TITLE = "Install POSM at store";
  const DETAILS_CID = "ipfs://ticket-details-cid";
  const PROOF_CID = "ipfs://proof-image-cid";
  const PROOF_NOTE = "Completed and uploaded photos";

  async function createTicketFor(account = company, value = TICKET_VALUE) {
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3 * ONE_DAY;

    const tx = await board
      .connect(account)
      .createTicket(TITLE, DETAILS_CID, deadline, { value });

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

    const created = await createTicketFor();
    ticket = created.instance;
    ticketAddr = created.addr;
  });

  describe("Initial State", function () {
    it("✅ Should have correct initial status as Open", async function () {
      expect(await ticket.status()).to.equal(0); // Open
    });

    it("✅ Should have correct company address", async function () {
      expect(await ticket.company()).to.equal(company.address);
    });

    it("✅ Should have correct amount", async function () {
      expect(await ticket.amount()).to.equal(TICKET_VALUE);
    });

    it("✅ Should have correct arbiter address", async function () {
      expect(await ticket.arbiter()).to.equal(await multisig.getAddress());
    });

    it("✅ Should have worker as zero address initially", async function () {
      expect(await ticket.worker()).to.equal(ethers.ZeroAddress);
    });

    it("✅ Should have board address set correctly", async function () {
      expect(await ticket.factory()).to.equal(await board.getAddress());
    });

    it("✅ Should store title and detailsCID", async function () {
      expect(await ticket.title()).to.equal(TITLE);
      expect(await ticket.detailsCID()).to.equal(DETAILS_CID);
    });
  });

  describe("Claim Ticket", function () {
    it("✅ Any non-company user can claim ticket", async function () {
      await expect(ticket.connect(worker).claimTicket()).to.emit(
        ticket,
        "TicketClaimed"
      );

      expect(await ticket.worker()).to.equal(worker.address);
      expect(await ticket.status()).to.equal(1); // Claimed
    });

    it("❌ Company cannot claim its own ticket", async function () {
      await expect(ticket.connect(company).claimTicket()).to.be.revertedWith(
        "Company cannot claim"
      );
    });

    it("❌ Cannot claim ticket twice by same user", async function () {
      await ticket.connect(worker).claimTicket();
      await expect(ticket.connect(worker).claimTicket()).to.be.revertedWith(
        "Ticket not open"
      );
    });

    it("❌ Cannot claim ticket twice by different user", async function () {
      await ticket.connect(worker).claimTicket();
      await expect(ticket.connect(randomUser).claimTicket()).to.be.revertedWith(
        "Ticket not open"
      );
    });
  });

  describe("Submit Proof", function () {
    beforeEach(async function () {
      await ticket.connect(worker).claimTicket();
    });

    it("✅ Worker can submit proof", async function () {
      await expect(
        ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE)
      ).to.emit(ticket, "ProofSubmitted");

      expect(await ticket.status()).to.equal(2); // Submitted
      expect(await ticket.proofCID()).to.equal(PROOF_CID);
      expect(await ticket.proofNote()).to.equal(PROOF_NOTE);
    });

    it("❌ Only worker can submit proof", async function () {
      await expect(
        ticket.connect(company).submitProof(PROOF_CID, PROOF_NOTE)
      ).to.be.revertedWith("Not worker");
    });

    it("❌ Random user cannot submit proof", async function () {
      await expect(
        ticket.connect(randomUser).submitProof(PROOF_CID, PROOF_NOTE)
      ).to.be.revertedWith("Not worker");
    });

    it("❌ Cannot submit proof without CID", async function () {
      await expect(
        ticket.connect(worker).submitProof("", PROOF_NOTE)
      ).to.be.revertedWith("Proof CID required");
    });

    it("❌ Cannot submit proof twice without resubmission request", async function () {
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await expect(
        ticket.connect(worker).submitProof("ipfs://another", "again")
      ).to.be.revertedWith("Invalid state");
    });
  });

  describe("Approve Submission / Resubmission", function () {
    beforeEach(async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
    });

    it("✅ Company can approve submission", async function () {
      const workerBalanceBefore = await ethers.provider.getBalance(
        worker.address
      );

      await ticket.connect(company).approveSubmission();

      expect(await ticket.status()).to.equal(4); // Paid

      const workerBalanceAfter = await ethers.provider.getBalance(worker.address);
      expect(workerBalanceAfter - workerBalanceBefore).to.equal(TICKET_VALUE);
    });

    it("❌ Only company can approve submission", async function () {
      await expect(
        ticket.connect(worker).approveSubmission()
      ).to.be.revertedWith("Not company");
    });

    it("✅ Company can request resubmission", async function () {
      await expect(
        ticket.connect(company).requestResubmission("Photos are unclear")
      ).to.emit(ticket, "SubmissionRejected");

      expect(await ticket.status()).to.equal(1); // Claimed
      expect(await ticket.proofCID()).to.equal("");
      expect(await ticket.proofNote()).to.equal("");
      expect(await ticket.rejectionReason()).to.equal("Photos are unclear");
    });

    it("❌ Cannot approve before submission", async function () {
      const created = await createTicketFor();
      const newTicket = created.instance;

      await newTicket.connect(worker).claimTicket();

      await expect(
        newTicket.connect(company).approveSubmission()
      ).to.be.revertedWith("Not submitted");
    });
  });

  describe("Cancel Ticket", function () {
    it("✅ Company can cancel open ticket", async function () {
      const companyBalanceBefore = await ethers.provider.getBalance(
        company.address
      );

      await expect(ticket.connect(company).cancelOpenTicket()).to.emit(
        ticket,
        "TicketCancelled"
      );

      expect(await ticket.status()).to.equal(6); // Cancelled
      expect(await ethers.provider.getBalance(ticketAddr)).to.equal(0);

      const companyBalanceAfter = await ethers.provider.getBalance(
        company.address
      );
      expect(companyBalanceAfter - companyBalanceBefore).to.equal(TICKET_VALUE);
    });

    it("❌ Non-company cannot cancel", async function () {
      await expect(
        ticket.connect(worker).cancelOpenTicket()
      ).to.be.revertedWith("Not company");
    });

    it("❌ Cannot cancel after ticket is claimed", async function () {
      await ticket.connect(worker).claimTicket();
      await expect(
        ticket.connect(company).cancelOpenTicket()
      ).to.be.revertedWith("Cannot cancel");
    });
  });

  describe("Dispute", function () {
    beforeEach(async function () {
      await ticket.connect(worker).claimTicket();
    });

    it("❌ Company cannot dispute before proof is submitted", async function () {
      await expect(
        ticket.connect(company).disputeByCompany()
      ).to.be.revertedWith("Not submitted");
    });

    it("✅ Company can dispute after proof is submitted", async function () {
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await expect(ticket.connect(company).disputeByCompany())
        .to.emit(ticket, "DisputeOpened")
        .withArgs(company.address);

      expect(await ticket.status()).to.equal(3); // Disputed
    });

    it("❌ Worker cannot dispute before deadline", async function () {
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await expect(
        ticket.connect(worker).disputeByWorker()
      ).to.be.revertedWith("Deadline not passed");
    });

    it("✅ Worker can dispute after deadline if company does not respond", async function () {
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await ethers.provider.send("evm_increaseTime", [4 * ONE_DAY]);
      await ethers.provider.send("evm_mine", []);

      await expect(ticket.connect(worker).disputeByWorker())
        .to.emit(ticket, "DisputeOpened")
        .withArgs(worker.address);

      expect(await ticket.status()).to.equal(3); // Disputed
    });
  });

  describe("Resolve Dispute", function () {
    beforeEach(async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket.connect(company).disputeByCompany();
    });

    it("✅ Arbiters vote pay worker -> worker receives funds", async function () {
      const workerBalanceBefore = await ethers.provider.getBalance(
        worker.address
      );

      await multisig.connect(arbiter1).vote(ticketAddr, true);
      await multisig.connect(arbiter2).vote(ticketAddr, true);

      expect(await ticket.status()).to.equal(4); // Paid

      const workerBalanceAfter = await ethers.provider.getBalance(worker.address);
      expect(workerBalanceAfter - workerBalanceBefore).to.equal(TICKET_VALUE);
    });

    it("✅ Arbiters vote refund company -> company receives funds", async function () {
      const companyBalanceBefore = await ethers.provider.getBalance(
        company.address
      );

      await multisig.connect(arbiter1).vote(ticketAddr, false);
      await multisig.connect(arbiter2).vote(ticketAddr, false);

      expect(await ticket.status()).to.equal(5); // Refunded

      const companyBalanceAfter = await ethers.provider.getBalance(
        company.address
      );
      expect(companyBalanceAfter - companyBalanceBefore).to.equal(TICKET_VALUE);
    });

    it("❌ Only arbiter can resolve dispute directly", async function () {
      await expect(
        ticket.connect(company).resolveDispute(true)
      ).to.be.revertedWith("Not arbiter");
    });

    it("❌ Cannot resolve dispute if no dispute exists", async function () {
      const created = await createTicketFor();
      const newTicket = created.instance;
      const newAddr = created.addr;

      await newTicket.connect(worker).claimTicket();
      await newTicket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);

      await multisig.connect(arbiter1).vote(newAddr, true);

      await expect(
        multisig.connect(arbiter2).vote(newAddr, true)
      ).to.be.revertedWith("No dispute");
    });
  });

  describe("Balance & Payment", function () {
    it("✅ Ticket contract holds the correct amount", async function () {
      const balance = await ethers.provider.getBalance(ticketAddr);
      expect(balance).to.equal(TICKET_VALUE);
    });

    it("✅ Balance becomes 0 after worker payment", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket.connect(company).approveSubmission();

      const balance = await ethers.provider.getBalance(ticketAddr);
      expect(balance).to.equal(0);
    });

    it("✅ Balance becomes 0 after company refund", async function () {
      await ticket.connect(worker).claimTicket();
      await ticket.connect(worker).submitProof(PROOF_CID, PROOF_NOTE);
      await ticket.connect(company).disputeByCompany();

      await multisig.connect(arbiter1).vote(ticketAddr, false);
      await multisig.connect(arbiter2).vote(ticketAddr, false);

      const balance = await ethers.provider.getBalance(ticketAddr);
      expect(balance).to.equal(0);
    });
  });
});