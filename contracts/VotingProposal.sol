// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title ProposalVoting
 * @dev A decentralized voting system where token holders can create and vote on proposals
 * @notice This contract allows members to submit proposals and vote using a token-weighted system
 */
contract ProposalVoting {
    
    // ============ State Variables ============
    
    /// @notice Owner of the contract (deployer)
    address public owner;
    
    /// @notice Total supply of voting tokens
    uint256 public totalSupply;
    
    /// @notice Minimum token balance required to create a proposal
    uint256 public constant MIN_TOKENS_TO_PROPOSE = 100;
    
    /// @notice Voting threshold percentage (50% = 5000 basis points)
    uint256 public constant VOTING_THRESHOLD = 5000; // 50%
    uint256 public constant BASIS_POINTS = 10000; // 100%
    
    /// @notice Counter for proposal IDs
    uint256 public proposalCount;
    
    // ============ Mappings ============
    
    /// @notice Mapping of address to token balance
    mapping(address => uint256) public balances;
    
    /// @notice Mapping of proposal ID to Proposal struct
    mapping(uint256 => Proposal) public proposals;
    
    /// @notice Mapping to track if an address has voted on a proposal (proposalId => voter => hasVoted)
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    
    /// @notice Mapping to track vote choice (proposalId => voter => votedYes)
    mapping(uint256 => mapping(address => bool)) public voteChoice;
    
    // ============ Structs ============
    
    /// @notice Proposal structure containing all proposal data
    struct Proposal {
        uint256 id;
        string description;
        address proposer;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 createdAt;
        uint256 deadline;
        bool executed;
        ProposalStatus status;
    }
    
    /// @notice Enum for proposal status
    enum ProposalStatus {
        Active,
        Passed,
        Failed,
        Executed
    }
    
    // ============ Events ============
    
    /// @notice Emitted when tokens are minted
    event TokensMinted(address indexed to, uint256 amount);
    
    /// @notice Emitted when a new proposal is created
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string description,
        uint256 deadline
    );
    
    /// @notice Emitted when a vote is cast
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );
    
    /// @notice Emitted when a proposal is executed
    event ProposalExecuted(uint256 indexed proposalId, bool passed);
    
    // ============ Modifiers ============
    
    /// @notice Restricts function to contract owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    /// @notice Checks if proposal exists
    modifier proposalExists(uint256 _proposalId) {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Proposal does not exist");
        _;
    }
    
    /// @notice Checks if proposal is still active
    modifier proposalActive(uint256 _proposalId) {
        require(proposals[_proposalId].status == ProposalStatus.Active, "Proposal is not active");
        require(block.timestamp <= proposals[_proposalId].deadline, "Voting period has ended");
        _;
    }
    
    // ============ Constructor ============
    
    /**
     * @dev Initializes the contract and mints initial tokens to the deployer
     */
    constructor() {
        owner = msg.sender;
        // Mint initial supply to owner for testing
        _mint(msg.sender, 10000);
    }
    
    // ============ Token Functions ============
    
    /**
     * @notice Mints new voting tokens (only owner)
     * @param _to Address to receive tokens
     * @param _amount Amount of tokens to mint
     */
    function mint(address _to, uint256 _amount) external onlyOwner {
        _mint(_to, _amount);
    }
    
    /**
     * @dev Internal function to mint tokens
     * @param _to Address to receive tokens
     * @param _amount Amount of tokens to mint
     */
    function _mint(address _to, uint256 _amount) internal {
        require(_to != address(0), "Cannot mint to zero address");
        require(_amount > 0, "Amount must be greater than zero");
        
        balances[_to] += _amount;
        totalSupply += _amount;
        
        emit TokensMinted(_to, _amount);
    }
    
    /**
     * @notice Transfers tokens to another address
     * @param _to Recipient address
     * @param _amount Amount to transfer
     */
    function transfer(address _to, uint256 _amount) external returns (bool) {
        require(_to != address(0), "Cannot transfer to zero address");
        require(balances[msg.sender] >= _amount, "Insufficient balance");
        
        balances[msg.sender] -= _amount;
        balances[_to] += _amount;
        
        return true;
    }
    
    // ============ Proposal Functions ============
    
    /**
     * @notice Creates a new proposal
     * @param _description Text description of the proposal
     * @param _votingPeriod Duration of voting period in seconds
     */
    function createProposal(string memory _description, uint256 _votingPeriod) external returns (uint256) {
        require(balances[msg.sender] >= MIN_TOKENS_TO_PROPOSE, "Insufficient tokens to create proposal");
        require(bytes(_description).length > 0, "Description cannot be empty");
        require(_votingPeriod >= 60, "Voting period must be at least 60 seconds");
        require(_votingPeriod <= 30 days, "Voting period cannot exceed 30 days");
        
        proposalCount++;
        uint256 deadline = block.timestamp + _votingPeriod;
        
        proposals[proposalCount] = Proposal({
            id: proposalCount,
            description: _description,
            proposer: msg.sender,
            yesVotes: 0,
            noVotes: 0,
            createdAt: block.timestamp,
            deadline: deadline,
            executed: false,
            status: ProposalStatus.Active
        });
        
        emit ProposalCreated(proposalCount, msg.sender, _description, deadline);
        
        return proposalCount;
    }
    
    /**
     * @notice Casts a vote on a proposal
     * @param _proposalId ID of the proposal to vote on
     * @param _support True for yes, false for no
     */
    function vote(uint256 _proposalId, bool _support) external 
        proposalExists(_proposalId) 
        proposalActive(_proposalId) 
    {
        require(balances[msg.sender] > 0, "Must have tokens to vote");
        require(!hasVoted[_proposalId][msg.sender], "Already voted on this proposal");
        
        uint256 weight = balances[msg.sender];
        hasVoted[_proposalId][msg.sender] = true;
        voteChoice[_proposalId][msg.sender] = _support;
        
        if (_support) {
            proposals[_proposalId].yesVotes += weight;
        } else {
            proposals[_proposalId].noVotes += weight;
        }
        
        emit VoteCast(_proposalId, msg.sender, _support, weight);
    }
    
    /**
     * @notice Executes a proposal after voting period ends
     * @param _proposalId ID of the proposal to execute
     */
    function executeProposal(uint256 _proposalId) external proposalExists(_proposalId) {
        Proposal storage proposal = proposals[_proposalId];
        
        require(block.timestamp > proposal.deadline, "Voting period has not ended");
        require(!proposal.executed, "Proposal already executed");
        require(proposal.status == ProposalStatus.Active, "Proposal is not active");
        
        uint256 totalVotes = proposal.yesVotes + proposal.noVotes;
        bool passed = false;
        
        // Check if quorum is met and if yes votes exceed threshold
        if (totalVotes > 0) {
            uint256 yesPercentage = (proposal.yesVotes * BASIS_POINTS) / totalVotes;
            passed = yesPercentage >= VOTING_THRESHOLD;
        }
        
        proposal.executed = true;
        proposal.status = passed ? ProposalStatus.Passed : ProposalStatus.Failed;
        
        if (passed) {
            proposal.status = ProposalStatus.Executed;
        }
        
        emit ProposalExecuted(_proposalId, passed);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Gets detailed information about a proposal
     * @param _proposalId ID of the proposal
     * @return Proposal struct
     */
    function getProposal(uint256 _proposalId) external view proposalExists(_proposalId) returns (Proposal memory) {
        return proposals[_proposalId];
    }
    
    /**
     * @notice Checks if voting period is still active
     * @param _proposalId ID of the proposal
     * @return True if voting is active
     */
    function isVotingActive(uint256 _proposalId) external view proposalExists(_proposalId) returns (bool) {
        return block.timestamp <= proposals[_proposalId].deadline && 
               proposals[_proposalId].status == ProposalStatus.Active;
    }
    
    /**
     * @notice Gets vote counts for a proposal
     * @param _proposalId ID of the proposal
     * @return yesVotes Number of yes votes
     * @return noVotes Number of no votes
     * @return totalVotes Total votes cast
     */
    function getVoteCounts(uint256 _proposalId) external view proposalExists(_proposalId) 
        returns (uint256 yesVotes, uint256 noVotes, uint256 totalVotes) 
    {
        Proposal memory proposal = proposals[_proposalId];
        return (proposal.yesVotes, proposal.noVotes, proposal.yesVotes + proposal.noVotes);
    }
    
    /**
     * @notice Checks if address has voted on a proposal
     * @param _proposalId ID of the proposal
     * @param _voter Address to check
     * @return True if already voted
     */
    function hasVotedOnProposal(uint256 _proposalId, address _voter) external view returns (bool) {
        return hasVoted[_proposalId][_voter];
    }
    
    /**
     * @notice Gets the voting power of an address
     * @param _account Address to check
     * @return Token balance (voting power)
     */
    function getVotingPower(address _account) external view returns (uint256) {
        return balances[_account];
    }
}