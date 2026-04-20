// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TicketEscrow.sol";

contract TicketBoard {
    /* =============================================================
                                STORAGE
       ============================================================= */

    /// @notice DisputeMultiSig contract address
    address public arbiter;

    /// @notice Danh sách tất cả ticket
    address[] public tickets;

    /// @notice ticket hợp lệ do factory tạo ra hay không
    mapping(address => bool) public isTicket;

    /// @notice Company => list ticket đã tạo
    mapping(address => address[]) public ticketsByCompany;

    /// @notice Worker => list ticket đã nhận
    mapping(address => address[]) public ticketsByWorker;

    /* =============================================================
                                EVENTS
       ============================================================= */

    event TicketCreated(
        address indexed escrow,
        address indexed company,
        string title,
        uint256 amount,
        uint256 deadline,
        uint256 timestamp
    );

    event TicketClaimIndexed(
        address indexed escrow,
        address indexed worker,
        uint256 timestamp
    );

    /* =============================================================
                              CONSTRUCTOR
       ============================================================= */

    constructor(address _arbiter) {
        require(_arbiter != address(0), "Invalid arbiter");
        arbiter = _arbiter;
    }

    /* =============================================================
                              MAIN LOGIC
       ============================================================= */

    function createTicket(
        string calldata title,
        string calldata detailsCID,
        uint256 deadline
    ) external payable returns (address) {
        require(msg.value > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Invalid deadline");
        require(bytes(title).length > 0, "Title required");

        TicketEscrow escrow = new TicketEscrow();

        escrow.init{value: msg.value}(msg.sender, deadline, title, detailsCID);
        escrow.setArbiter(arbiter);

        address escrowAddr = address(escrow);

        tickets.push(escrowAddr);
        isTicket[escrowAddr] = true;
        ticketsByCompany[msg.sender].push(escrowAddr);

        emit TicketCreated(
            escrowAddr,
            msg.sender,
            title,
            msg.value,
            deadline,
            block.timestamp
        );

        return escrowAddr;
    }

    /// @notice Được gọi từ ticket khi worker claim thành công
    function onTicketClaim(address worker) external {
        require(isTicket[msg.sender], "Only registered ticket");
        require(worker != address(0), "Invalid worker");

        ticketsByWorker[worker].push(msg.sender);

        emit TicketClaimIndexed(msg.sender, worker, block.timestamp);
    }

    /* =============================================================
                              VIEW FUNCTIONS
       ============================================================= */

    function totalTickets() external view returns (uint256) {
        return tickets.length;
    }

    function getTicket(uint256 index) external view returns (address) {
        require(index < tickets.length, "Index out of bounds");
        return tickets[index];
    }

    function getAllTickets() external view returns (address[] memory) {
        return tickets;
    }

    function getTicketsByCompany(
        address company
    ) external view returns (address[] memory) {
        return ticketsByCompany[company];
    }

    function getTicketsByWorker(
        address worker
    ) external view returns (address[] memory) {
        return ticketsByWorker[worker];
    }
}