// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEscrowFactory {
    function onTicketClaim(address worker) external;
}

contract TicketEscrow {
    /* =====================================================
                            STORAGE
       =====================================================*/

    address public factory;

    address payable public company;
    address payable public worker;

    uint256 public amount;
    uint256 public deadline;
    uint256 public createdAt;
    uint256 public claimedAt;
    uint256 public submittedAt;
    uint256 public approvedAt;

    /// @notice DisputeMultiSig contract
    address public arbiter;

    /// @notice Ticket metadata
    string public title;
    string public detailsCID;

    /// @notice Submission data
    string public proofCID;
    string public proofNote;
    string public rejectionReason;

    enum Status {
        Open,
        Claimed,
        Submitted,
        Disputed,
        Paid,
        Refunded,
        Cancelled
    }

    Status public status;

    /* =====================================================
                            EVENTS
       =====================================================*/

    event TicketClaimed(address indexed worker, uint256 claimedAt);
    event ProofSubmitted(
        address indexed worker,
        string proofCID,
        string proofNote,
        uint256 submittedAt
    );
    event SubmissionRejected(string reason, uint256 timestamp);
    event DisputeOpened(address indexed openedBy);
    event Paid(address indexed worker, uint256 amount);
    event Refunded(address indexed company, uint256 amount);
    event TicketCancelled(address indexed company, uint256 amount);

    /* =====================================================
                            MODIFIERS
       =====================================================*/

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory");
        _;
    }

    modifier onlyCompany() {
        require(msg.sender == company, "Not company");
        _;
    }

    modifier onlyWorker() {
        require(msg.sender == worker, "Not worker");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Not arbiter");
        _;
    }

    /* =====================================================
                            CONSTRUCTOR
       =====================================================*/

    constructor() {
        factory = msg.sender;
    }

    /* =====================================================
                        INITIALIZATION
       =====================================================*/

    function init(
        address _company,
        uint256 _deadline,
        string calldata _title,
        string calldata _detailsCID
    ) external payable onlyFactory {
        require(company == address(0), "Already initialized");
        require(_company != address(0), "Invalid company");
        require(_deadline > block.timestamp, "Invalid deadline");
        require(msg.value > 0, "Amount must be > 0");
        require(bytes(_title).length > 0, "Title required");

        company = payable(_company);
        amount = msg.value;
        deadline = _deadline;
        title = _title;
        detailsCID = _detailsCID;
        createdAt = block.timestamp;
        status = Status.Open;
    }

    /* =====================================================
                            SETUP
       =====================================================*/

    function setArbiter(address _arbiter) external onlyFactory {
        require(arbiter == address(0), "Arbiter already set");
        require(_arbiter != address(0), "Invalid arbiter");

        arbiter = _arbiter;
    }

    /* =====================================================
                        WORKER FLOW
       =====================================================*/

    function claimTicket() external {
        require(status == Status.Open, "Ticket not open");
        require(worker == address(0), "Already claimed");
        require(msg.sender != company, "Company cannot claim");

        worker = payable(msg.sender);
        claimedAt = block.timestamp;
        status = Status.Claimed;

        IEscrowFactory(factory).onTicketClaim(msg.sender);

        emit TicketClaimed(msg.sender, claimedAt);
    }

    function submitProof(
        string calldata _proofCID,
        string calldata _proofNote
    ) external onlyWorker {
        require(status == Status.Claimed, "Invalid state");
        require(bytes(_proofCID).length > 0, "Proof CID required");

        proofCID = _proofCID;
        proofNote = _proofNote;
        rejectionReason = "";
        submittedAt = block.timestamp;
        status = Status.Submitted;

        emit ProofSubmitted(msg.sender, _proofCID, _proofNote, submittedAt);
    }

    /* =====================================================
                        COMPANY FLOW
       =====================================================*/

    function approveSubmission() external onlyCompany {
        require(status == Status.Submitted, "Not submitted");

        status = Status.Paid;
        approvedAt = block.timestamp;

        uint256 payout = _payWorker();
        emit Paid(worker, payout);
    }

    /// @notice Công ty yêu cầu cộng tác viên làm lại / nộp lại minh chứng
    function requestResubmission(
        string calldata reason
    ) external onlyCompany {
        require(status == Status.Submitted, "Not submitted");
        require(bytes(reason).length > 0, "Reason required");

        rejectionReason = reason;
        proofCID = "";
        proofNote = "";
        submittedAt = 0;
        status = Status.Claimed;

        emit SubmissionRejected(reason, block.timestamp);
    }

    /// @notice Công ty hủy ticket khi chưa có ai nhận
    function cancelOpenTicket() external onlyCompany {
        require(status == Status.Open, "Cannot cancel");

        status = Status.Cancelled;

        uint256 refund = _refundCompany();
        emit TicketCancelled(company, refund);
    }

    /// @notice Công ty mở tranh chấp sau khi worker đã submit
    function disputeByCompany() external onlyCompany {
        require(status == Status.Submitted, "Not submitted");

        status = Status.Disputed;
        emit DisputeOpened(msg.sender);
    }

    /* =====================================================
                        WORKER DISPUTE
       =====================================================*/

    /// @notice Worker có thể mở dispute nếu đã submit nhưng công ty không phản hồi sau deadline
    function disputeByWorker() external onlyWorker {
        require(status == Status.Submitted, "Not submitted");
        require(block.timestamp > deadline, "Deadline not passed");

        status = Status.Disputed;
        emit DisputeOpened(msg.sender);
    }

    /* =====================================================
                    DISPUTE RESOLUTION
       =====================================================*/

    function resolveDispute(bool payWorker_) external onlyArbiter {
        require(status == Status.Disputed, "No dispute");

        if (payWorker_) {
            status = Status.Paid;
            approvedAt = block.timestamp;

            uint256 payout = _payWorker();
            emit Paid(worker, payout);
        } else {
            status = Status.Refunded;

            uint256 refund = _refundCompany();
            emit Refunded(company, refund);
        }
    }

    /* =====================================================
                        INTERNAL PAYMENTS
       =====================================================*/

    function _payWorker() internal returns (uint256 payout) {
        payout = amount;
        amount = 0;

        (bool ok, ) = worker.call{value: payout}("");
        require(ok, "Transfer failed");
    }

    function _refundCompany() internal returns (uint256 refund) {
        refund = amount;
        amount = 0;

        (bool ok, ) = company.call{value: refund}("");
        require(ok, "Transfer failed");
    }
}