// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PredictionMarket
 * @notice Simple AMM-based prediction market for Coordination Olympiad games.
 * @dev Uses a constant-product-like formula for binary outcomes.
 *
 * Market types:
 *   - "Who wins?" (one market per agent)
 *   - "Will Agent X betray?" (binary yes/no)
 *   - "Will alliance form?" (binary yes/no)
 *   - "Resource price target?" (binary yes/no)
 *
 * Trading fees (2%) flow to the prize pool.
 */
contract PredictionMarket {
    // ============================================================
    // State
    // ============================================================

    address public owner;
    address public prizePool; // Fee recipient
    uint256 public constant FEE_BPS = 200; // 2%

    struct Market {
        bytes32 id;
        bytes32 gameId;
        string question;
        uint256 yesShares;    // Total YES share supply
        uint256 noShares;     // Total NO share supply
        uint256 yesPool;      // ETH backing YES
        uint256 noPool;       // ETH backing NO
        bool resolved;
        bool outcome;         // true = YES won
        uint256 createdAt;
        uint256 resolvesBy;   // Deadline
    }

    mapping(bytes32 => Market) public markets;
    // marketId => user => YES shares held
    mapping(bytes32 => mapping(address => uint256)) public yesBalances;
    // marketId => user => NO shares held
    mapping(bytes32 => mapping(address => uint256)) public noBalances;

    uint256 public totalFeesCollected;

    // ============================================================
    // Events
    // ============================================================

    event MarketCreated(bytes32 indexed marketId, bytes32 indexed gameId, string question);
    event SharesPurchased(bytes32 indexed marketId, address indexed buyer, bool isYes, uint256 amount, uint256 cost);
    event SharesSold(bytes32 indexed marketId, address indexed seller, bool isYes, uint256 amount, uint256 payout);
    event MarketResolved(bytes32 indexed marketId, bool outcome);
    event WinningsClaimed(bytes32 indexed marketId, address indexed claimer, uint256 amount);

    // ============================================================
    // Constructor
    // ============================================================

    constructor(address _prizePool) {
        owner = msg.sender;
        prizePool = _prizePool;
    }

    // ============================================================
    // Market lifecycle
    // ============================================================

    /**
     * @notice Create a new binary prediction market
     */
    function createMarket(
        bytes32 marketId,
        bytes32 gameId,
        string calldata question,
        uint256 resolvesBy
    ) external payable {
        require(markets[marketId].createdAt == 0, "Market exists");
        require(msg.value >= 0.01 ether, "Min 0.01 ETH initial liquidity");

        uint256 halfValue = msg.value / 2;

        markets[marketId] = Market({
            id: marketId,
            gameId: gameId,
            question: question,
            yesShares: halfValue,
            noShares: halfValue,
            yesPool: halfValue,
            noPool: msg.value - halfValue,
            resolved: false,
            outcome: false,
            createdAt: block.timestamp,
            resolvesBy: resolvesBy
        });

        emit MarketCreated(marketId, gameId, question);
    }

    /**
     * @notice Buy YES or NO shares
     * @dev Price determined by constant product: yesPool * noPool = k
     *      Buying YES: send ETH to yesPool, get shares proportional to noPool decrease
     */
    function buy(bytes32 marketId, bool buyYes) external payable {
        Market storage market = markets[marketId];
        require(market.createdAt > 0, "Market not found");
        require(!market.resolved, "Market resolved");
        require(msg.value > 0, "Must send ETH");

        // Deduct fee
        uint256 fee = msg.value * FEE_BPS / 10000;
        uint256 amount = msg.value - fee;

        // Send fee to prize pool
        if (fee > 0) {
            (bool s, ) = prizePool.call{value: fee}("");
            require(s, "Fee transfer failed");
            totalFeesCollected += fee;
        }

        uint256 shares;
        if (buyYes) {
            // Add to YES pool, compute shares from constant product
            uint256 k = market.yesPool * market.noPool;
            market.yesPool += amount;
            uint256 newNoPool = k / market.yesPool;
            shares = market.noPool - newNoPool;
            market.noPool = newNoPool;
            market.yesShares += shares;
            yesBalances[marketId][msg.sender] += shares;

            emit SharesPurchased(marketId, msg.sender, true, shares, msg.value);
        } else {
            uint256 k = market.yesPool * market.noPool;
            market.noPool += amount;
            uint256 newYesPool = k / market.noPool;
            shares = market.yesPool - newYesPool;
            market.yesPool = newYesPool;
            market.noShares += shares;
            noBalances[marketId][msg.sender] += shares;

            emit SharesPurchased(marketId, msg.sender, false, shares, msg.value);
        }
    }

    /**
     * @notice Resolve a market with the outcome
     * @dev Only callable by owner (game oracle)
     */
    function resolve(bytes32 marketId, bool outcome) external {
        require(msg.sender == owner, "Not owner");
        Market storage market = markets[marketId];
        require(market.createdAt > 0, "Market not found");
        require(!market.resolved, "Already resolved");

        market.resolved = true;
        market.outcome = outcome;

        emit MarketResolved(marketId, outcome);
    }

    /**
     * @notice Claim winnings from a resolved market
     */
    function claim(bytes32 marketId) external {
        Market storage market = markets[marketId];
        require(market.resolved, "Not resolved");

        uint256 shares;
        if (market.outcome) {
            shares = yesBalances[marketId][msg.sender];
            yesBalances[marketId][msg.sender] = 0;
        } else {
            shares = noBalances[marketId][msg.sender];
            noBalances[marketId][msg.sender] = 0;
        }

        require(shares > 0, "No winning shares");

        // Payout proportional to share of winning pool
        uint256 totalPool = market.yesPool + market.noPool;
        uint256 winningShares = market.outcome ? market.yesShares : market.noShares;
        uint256 payout = totalPool * shares / winningShares;

        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // ============================================================
    // View functions
    // ============================================================

    /**
     * @notice Get current implied probability for YES outcome
     * @return Probability in basis points (0-10000)
     */
    function getYesProbability(bytes32 marketId) external view returns (uint256) {
        Market storage market = markets[marketId];
        if (market.yesPool + market.noPool == 0) return 5000;
        return market.noPool * 10000 / (market.yesPool + market.noPool);
    }

    /**
     * @notice Get estimated cost to buy shares
     */
    function getQuote(bytes32 marketId, bool buyYes, uint256 ethAmount) external view returns (uint256 shares) {
        Market storage market = markets[marketId];
        uint256 amount = ethAmount * (10000 - FEE_BPS) / 10000;
        uint256 k = market.yesPool * market.noPool;

        if (buyYes) {
            uint256 newYesPool = market.yesPool + amount;
            shares = market.noPool - (k / newYesPool);
        } else {
            uint256 newNoPool = market.noPool + amount;
            shares = market.yesPool - (k / newNoPool);
        }
    }

    receive() external payable {}
}
