// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PrizePool
 * @notice Collects fees from game moves, messages, and entry; distributes prizes to winners.
 * @dev Designed for the Coordination Olympiad on Base L2.
 *
 * Fee Distribution:
 *   55% -> Prize Pool (winners)
 *   15% -> Prediction Market Pool (AMM liquidity)
 *   15% -> Platform Treasury
 *   10% -> Game Maker
 *    5% -> Reserve
 */
contract PrizePool {
    // ============================================================
    // State
    // ============================================================

    address public owner;
    address public treasury;
    address public predictionMarketPool;
    address public gameMaker;

    uint256 public constant PRIZE_BPS = 5500;    // 55%
    uint256 public constant MARKET_BPS = 1500;   // 15%
    uint256 public constant TREASURY_BPS = 1500; // 15%
    uint256 public constant MAKER_BPS = 1000;    // 10%
    uint256 public constant RESERVE_BPS = 500;   //  5%

    struct Game {
        bytes32 gameId;
        address[] players;
        uint256 entryFee;
        uint256 moveFee;
        uint256 messageFee;
        uint256 totalCollected;
        uint256 prizeAmount;
        bool resolved;
        address winner;
        mapping(uint256 => address) placeToPlayer; // 1st, 2nd, 3rd, 4th
        mapping(uint256 => uint256) placeToShare;  // BPS per place
    }

    mapping(bytes32 => Game) public games;
    mapping(address => uint256) public claimable; // Withdrawable balances

    uint256 public totalReserve;

    // ============================================================
    // Events
    // ============================================================

    event GameCreated(bytes32 indexed gameId, uint256 entryFee, uint256 moveFee);
    event FeeCollected(bytes32 indexed gameId, address indexed from, uint256 amount, string feeType);
    event GameResolved(bytes32 indexed gameId, address indexed winner, uint256 prizeAmount);
    event PrizeClaimed(address indexed player, uint256 amount);

    // ============================================================
    // Modifiers
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============================================================
    // Constructor
    // ============================================================

    constructor(address _treasury, address _predictionMarketPool, address _gameMaker) {
        owner = msg.sender;
        treasury = _treasury;
        predictionMarketPool = _predictionMarketPool;
        gameMaker = _gameMaker;
    }

    // ============================================================
    // Game lifecycle
    // ============================================================

    /**
     * @notice Create a new game and set fee structure
     */
    function createGame(
        bytes32 gameId,
        uint256 entryFee,
        uint256 moveFee,
        uint256 messageFee
    ) external onlyOwner {
        Game storage game = games[gameId];
        require(game.gameId == bytes32(0), "Game exists");

        game.gameId = gameId;
        game.entryFee = entryFee;
        game.moveFee = moveFee;
        game.messageFee = messageFee;

        // Default prize distribution: 50/25/15/10
        game.placeToShare[1] = 5000; // 50% of prize pool
        game.placeToShare[2] = 2500; // 25%
        game.placeToShare[3] = 1500; // 15%
        game.placeToShare[4] = 1000; // 10%

        emit GameCreated(gameId, entryFee, moveFee);
    }

    /**
     * @notice Agent pays entry fee to join a game
     */
    function enterGame(bytes32 gameId) external payable {
        Game storage game = games[gameId];
        require(game.gameId != bytes32(0), "Game not found");
        require(!game.resolved, "Game already resolved");
        require(msg.value >= game.entryFee, "Insufficient entry fee");

        game.players.push(msg.sender);
        _distributeFee(gameId, msg.value, "entry");
    }

    /**
     * @notice Collect per-move fee during gameplay
     */
    function collectMoveFee(bytes32 gameId, address player) external payable onlyOwner {
        Game storage game = games[gameId];
        require(game.gameId != bytes32(0), "Game not found");
        require(!game.resolved, "Game already resolved");

        _distributeFee(gameId, msg.value, "move");
    }

    /**
     * @notice Collect message fee during negotiation
     */
    function collectMessageFee(bytes32 gameId, address player) external payable onlyOwner {
        Game storage game = games[gameId];
        require(game.gameId != bytes32(0), "Game not found");
        require(!game.resolved, "Game already resolved");

        _distributeFee(gameId, msg.value, "message");
    }

    /**
     * @notice Resolve a game and distribute prizes
     * @param gameId The game to resolve
     * @param rankings Ordered array of player addresses [1st, 2nd, 3rd, 4th]
     */
    function resolveGame(bytes32 gameId, address[] calldata rankings) external onlyOwner {
        Game storage game = games[gameId];
        require(game.gameId != bytes32(0), "Game not found");
        require(!game.resolved, "Already resolved");
        require(rankings.length > 0, "No rankings");

        game.resolved = true;
        game.winner = rankings[0];

        uint256 prizePool = game.prizeAmount;

        // Distribute to ranked players
        for (uint256 i = 0; i < rankings.length && i < 4; i++) {
            uint256 share = prizePool * game.placeToShare[i + 1] / 10000;
            claimable[rankings[i]] += share;
            game.placeToPlayer[i + 1] = rankings[i];
        }

        emit GameResolved(gameId, rankings[0], prizePool);
    }

    /**
     * @notice Claim accumulated prizes
     */
    function claim() external {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "Nothing to claim");

        claimable[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit PrizeClaimed(msg.sender, amount);
    }

    // ============================================================
    // Fee distribution
    // ============================================================

    function _distributeFee(bytes32 gameId, uint256 amount, string memory feeType) internal {
        Game storage game = games[gameId];
        game.totalCollected += amount;

        // Split fee
        uint256 prizeShare = amount * PRIZE_BPS / 10000;
        uint256 marketShare = amount * MARKET_BPS / 10000;
        uint256 treasuryShare = amount * TREASURY_BPS / 10000;
        uint256 makerShare = amount * MAKER_BPS / 10000;
        uint256 reserveShare = amount - prizeShare - marketShare - treasuryShare - makerShare;

        // Prize stays in contract
        game.prizeAmount += prizeShare;

        // Distribute other shares
        if (marketShare > 0) {
            (bool s1, ) = predictionMarketPool.call{value: marketShare}("");
            require(s1, "Market transfer failed");
        }
        if (treasuryShare > 0) {
            (bool s2, ) = treasury.call{value: treasuryShare}("");
            require(s2, "Treasury transfer failed");
        }
        if (makerShare > 0) {
            (bool s3, ) = gameMaker.call{value: makerShare}("");
            require(s3, "Maker transfer failed");
        }
        totalReserve += reserveShare;

        emit FeeCollected(gameId, msg.sender, amount, feeType);
    }

    // ============================================================
    // Admin
    // ============================================================

    /**
     * @notice Add sponsor funds directly to a game's prize pool
     */
    function sponsorGame(bytes32 gameId) external payable {
        Game storage game = games[gameId];
        require(game.gameId != bytes32(0), "Game not found");
        game.prizeAmount += msg.value;
        game.totalCollected += msg.value;
    }

    function withdrawReserve(address to) external onlyOwner {
        uint256 amount = totalReserve;
        totalReserve = 0;
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {}
}
