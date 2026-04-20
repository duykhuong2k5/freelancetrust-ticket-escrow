// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFreelanceEscrow {
    function resolveDispute(bool payWorker) external;
}

contract DisputeMultiSig {
    /* =============================================================
                                STORAGE
       ============================================================= */

    address[] public arbiters;
    mapping(address => bool) public isArbiter;

    uint256 public required;

    struct VoteState {
        uint256 votesForWorker;
        uint256 votesForCompany;
        bool resolved;
        mapping(address => bool) hasVoted;
    }

    /// @notice ticket escrow => VoteState
    mapping(address => VoteState) private disputes;

    /* =============================================================
                                EVENTS
       ============================================================= */

    event Voted(
        address indexed ticket,
        address indexed arbiter,
        bool payWorker
    );

    event Resolved(address indexed ticket, bool payWorker);

    /* =============================================================
                                MODIFIER
       ============================================================= */

    modifier onlyArbiter() {
        require(isArbiter[msg.sender], "Not an arbiter");
        _;
    }

    /* =============================================================
                              CONSTRUCTOR
       ============================================================= */

    constructor(address[] memory _arbiters, uint256 _required) {
        require(_arbiters.length > 0, "No arbiters");
        require(
            _required > 0 && _required <= _arbiters.length,
            "Invalid required"
        );

        for (uint256 i = 0; i < _arbiters.length; i++) {
            address a = _arbiters[i];
            require(a != address(0), "Zero arbiter");
            require(!isArbiter[a], "Duplicate arbiter");

            arbiters.push(a);
            isArbiter[a] = true;
        }

        required = _required;
    }

    /* =============================================================
                              VOTING LOGIC
       ============================================================= */

    function vote(address ticket, bool payWorker) external onlyArbiter {
        require(ticket != address(0), "Invalid ticket");

        VoteState storage v = disputes[ticket];

        require(!v.resolved, "Dispute already resolved");
        require(!v.hasVoted[msg.sender], "Already voted");

        v.hasVoted[msg.sender] = true;

        if (payWorker) {
            v.votesForWorker++;
        } else {
            v.votesForCompany++;
        }

        emit Voted(ticket, msg.sender, payWorker);

        if (v.votesForWorker >= required) {
            v.resolved = true;
            IFreelanceEscrow(ticket).resolveDispute(true);
            emit Resolved(ticket, true);
        } else if (v.votesForCompany >= required) {
            v.resolved = true;
            IFreelanceEscrow(ticket).resolveDispute(false);
            emit Resolved(ticket, false);
        }
    }

    /* =============================================================
                              VIEW FUNCTIONS
       ============================================================= */

    function getVotes(
        address ticket
    )
        external
        view
        returns (
            uint256 forWorker,
            uint256 forCompany,
            bool resolved
        )
    {
        VoteState storage v = disputes[ticket];
        return (v.votesForWorker, v.votesForCompany, v.resolved);
    }

    function hasVoted(
        address ticket,
        address arbiter
    ) external view returns (bool) {
        return disputes[ticket].hasVoted[arbiter];
    }

    function getArbiters() external view returns (address[] memory) {
        return arbiters;
    }
}