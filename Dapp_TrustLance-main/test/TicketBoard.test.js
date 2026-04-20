const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketBoard - Comprehensive Tests", function () {
  let deployer, company1, company2, worker1, worker2, arbiter1, arbiter2, arbiter3;
  let board, multisig;

  const REQUIRED_VOTES = 2;
  const ONE_DAY = 24 * 60 * 60;
  const TICKET_VALUE = ethers.parseEther("1");
  const TICKET_VALUE_2 = ethers.parseEther("2.5");

  const TITLE_1 = "Visit store A";
  const TITLE_2 = "Take shelf photos";
  const DETAILS_1 = "ipfs://details-1";
  const DETAILS_2 = "ipfs://details-2";

  beforeEach(async function () {
    [deployer, company1, company2, worker1, worker2, arbiter1, arbiter2, arbiter3] =
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

  describe("Deployment", function () {
    it("✅ Board deploys correctly with arbiter set", async function () {
      expect(await board.arbiter()).to.equal(await multisig.getAddress());
    });

    it("❌ Cannot deploy board with zero address arbiter", async function () {
      const TicketBoard = await ethers.getContractFactory("TicketBoard");
      await expect(
        TicketBoard.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid arbiter");
    });

    it("✅ Board starts with 0 tickets", async function () {
      expect(await board.totalTickets()).to.equal(0);
    });
  });

  describe("Create Ticket", function () {
    it("✅ Company can create ticket with valid parameters", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      const tx = await board
        .connect(company1)
        .createTicket(TITLE_1, DETAILS_1, deadline, { value: TICKET_VALUE });

      const receipt = await tx.wait();
      const event = receipt.logs.find((l) => l.fragment?.name === "TicketCreated");

      expect(event).to.not.be.undefined;
      expect(event.args.company).to.equal(company1.address);
      expect(event.args.title).to.equal(TITLE_1);
      expect(event.args.amount).to.equal(TICKET_VALUE);
      expect(event.args.deadline).to.equal(deadline);
    });

    it("✅ Ticket count increases after creating tickets", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      expect(await board.totalTickets()).to.equal(0);

      await board
        .connect(company1)
        .createTicket(TITLE_1, DETAILS_1, deadline, { value: TICKET_VALUE });

      expect(await board.totalTickets()).to.equal(1);

      await board
        .connect(company2)
        .createTicket(TITLE_2, DETAILS_2, deadline, { value: TICKET_VALUE_2 });

      expect(await board.totalTickets()).to.equal(2);
    });

    it("❌ Cannot create ticket with past deadline", async function () {
      const block = await ethers.provider.getBlock("latest");
      const pastDeadline = block.timestamp - 1;

      await expect(
        board
          .connect(company1)
          .createTicket(TITLE_1, DETAILS_1, pastDeadline, { value: TICKET_VALUE })
      ).to.be.revertedWith("Invalid deadline");
    });

    it("❌ Cannot create ticket with zero value", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      await expect(
        board.connect(company1).createTicket(TITLE_1, DETAILS_1, deadline, {
          value: 0,
        })
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("❌ Cannot create ticket with empty title", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      await expect(
        board.connect(company1).createTicket("", DETAILS_1, deadline, {
          value: TICKET_VALUE,
        })
      ).to.be.revertedWith("Title required");
    });

    it("✅ Created ticket has correct arbiter, company, amount and metadata", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      const tx = await board
        .connect(company1)
        .createTicket(TITLE_2, DETAILS_2, deadline, { value: TICKET_VALUE_2 });

      const receipt = await tx.wait();
      const event = receipt.logs.find((l) => l.fragment?.name === "TicketCreated");

      const ticket = await ethers.getContractAt(
        "TicketEscrow",
        event.args.escrow
      );

      expect(await ticket.arbiter()).to.equal(await multisig.getAddress());
      expect(await ticket.company()).to.equal(company1.address);
      expect(await ticket.amount()).to.equal(TICKET_VALUE_2);
      expect(await ticket.title()).to.equal(TITLE_2);
      expect(await ticket.detailsCID()).to.equal(DETAILS_2);
    });
  });

  describe("View Functions", function () {
    let ticketAddr1, ticketAddr2, ticketAddr3;

    beforeEach(async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      let tx = await board
        .connect(company1)
        .createTicket(TITLE_1, DETAILS_1, deadline, { value: TICKET_VALUE });
      let receipt = await tx.wait();
      ticketAddr1 = receipt.logs.find(
        (l) => l.fragment?.name === "TicketCreated"
      ).args.escrow;

      tx = await board
        .connect(company1)
        .createTicket(TITLE_2, DETAILS_2, deadline, { value: TICKET_VALUE_2 });
      receipt = await tx.wait();
      ticketAddr2 = receipt.logs.find(
        (l) => l.fragment?.name === "TicketCreated"
      ).args.escrow;

      tx = await board
        .connect(company2)
        .createTicket("Check display", "ipfs://details-3", deadline, {
          value: TICKET_VALUE,
        });
      receipt = await tx.wait();
      ticketAddr3 = receipt.logs.find(
        (l) => l.fragment?.name === "TicketCreated"
      ).args.escrow;
    });

    it("✅ totalTickets returns correct count", async function () {
      expect(await board.totalTickets()).to.equal(3);
    });

    it("✅ getTicket returns correct ticket by index", async function () {
      expect(await board.getTicket(0)).to.equal(ticketAddr1);
      expect(await board.getTicket(1)).to.equal(ticketAddr2);
      expect(await board.getTicket(2)).to.equal(ticketAddr3);
    });

    it("❌ getTicket reverts for out of bounds index", async function () {
      await expect(board.getTicket(3)).to.be.revertedWith("Index out of bounds");
      await expect(board.getTicket(100)).to.be.revertedWith("Index out of bounds");
    });

    it("✅ getAllTickets returns correct array", async function () {
      const allTickets = await board.getAllTickets();

      expect(allTickets.length).to.equal(3);
      expect(allTickets[0]).to.equal(ticketAddr1);
      expect(allTickets[1]).to.equal(ticketAddr2);
      expect(allTickets[2]).to.equal(ticketAddr3);
    });

    it("✅ getTicketsByCompany returns correct tickets for company1", async function () {
      const company1Tickets = await board.getTicketsByCompany(company1.address);

      expect(company1Tickets.length).to.equal(2);
      expect(company1Tickets[0]).to.equal(ticketAddr1);
      expect(company1Tickets[1]).to.equal(ticketAddr2);
    });

    it("✅ getTicketsByCompany returns correct tickets for company2", async function () {
      const company2Tickets = await board.getTicketsByCompany(company2.address);

      expect(company2Tickets.length).to.equal(1);
      expect(company2Tickets[0]).to.equal(ticketAddr3);
    });

    it("✅ getTicketsByCompany returns empty array for company with no tickets", async function () {
      const noTickets = await board.getTicketsByCompany(deployer.address);
      expect(noTickets.length).to.equal(0);
    });

    it("✅ tickets array getter returns correct address", async function () {
      expect(await board.tickets(0)).to.equal(ticketAddr1);
      expect(await board.tickets(1)).to.equal(ticketAddr2);
      expect(await board.tickets(2)).to.equal(ticketAddr3);
    });

    it("✅ isTicket returns true for created ticket", async function () {
      expect(await board.isTicket(ticketAddr1)).to.equal(true);
      expect(await board.isTicket(ticketAddr2)).to.equal(true);
      expect(await board.isTicket(ticketAddr3)).to.equal(true);
      expect(await board.isTicket(deployer.address)).to.equal(false);
    });
  });

  describe("Worker Ticket Indexing", function () {
    it("✅ Worker claimed tickets are tracked correctly", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      const tx = await board
        .connect(company1)
        .createTicket(TITLE_1, DETAILS_1, deadline, { value: TICKET_VALUE });

      const receipt = await tx.wait();
      const ticketAddr = receipt.logs.find(
        (l) => l.fragment?.name === "TicketCreated"
      ).args.escrow;

      const ticket = await ethers.getContractAt("TicketEscrow", ticketAddr);

      await ticket.connect(worker1).claimTicket();

      const workerTickets = await board.getTicketsByWorker(worker1.address);
      expect(workerTickets.length).to.equal(1);
      expect(workerTickets[0]).to.equal(ticketAddr);
    });
  });

  describe("Multiple Tickets", function () {
    it("✅ Can create multiple tickets with different amounts", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      const amounts = [
        ethers.parseEther("0.5"),
        ethers.parseEther("1.5"),
        ethers.parseEther("5"),
        ethers.parseEther("0.01"),
      ];

      for (let i = 0; i < amounts.length; i++) {
        await board
          .connect(company1)
          .createTicket(`Ticket ${i}`, `ipfs://details-${i}`, deadline, {
            value: amounts[i],
          });
      }

      expect(await board.totalTickets()).to.equal(4);

      const allTickets = await board.getAllTickets();
      for (let i = 0; i < allTickets.length; i++) {
        const ticket = await ethers.getContractAt("TicketEscrow", allTickets[i]);
        expect(await ticket.amount()).to.equal(amounts[i]);
      }
    });

    it("✅ Tickets from different companies are tracked separately", async function () {
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3 * ONE_DAY;

      for (let i = 0; i < 3; i++) {
        await board
          .connect(company1)
          .createTicket(`C1-${i}`, `ipfs://c1-${i}`, deadline, {
            value: TICKET_VALUE,
          });
      }

      for (let i = 0; i < 2; i++) {
        await board
          .connect(company2)
          .createTicket(`C2-${i}`, `ipfs://c2-${i}`, deadline, {
            value: TICKET_VALUE,
          });
      }

      expect(await board.totalTickets()).to.equal(5);
      expect((await board.getTicketsByCompany(company1.address)).length).to.equal(3);
      expect((await board.getTicketsByCompany(company2.address)).length).to.equal(2);
    });
  });
});