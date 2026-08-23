// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// ============================================================
// SupplyChain.sol — Pharmaceutical Batch Tracking
// ============================================================
//
// WHAT CHANGED IN THIS VERSION (and why):
//
// 1. ON-CHAIN ROLES (new: `Role` enum + `roles` mapping + `assignRole`)
//    WHY: previously "who is a Manufacturer" only lived in the backend's
//    users.json — the contract itself had no idea. That meant the rule
//    "only Manufacturers can register a batch" or "a batch can only move
//    Manufacturer -> Transporter -> Distributor -> Pharmacy" was only
//    ever a UI convention, not a real guarantee — anyone could bypass
//    the dropdown and call transferOwnership() directly with any
//    address. Storing each wallet's role on-chain lets the contract
//    itself refuse an out-of-order transfer, which is the actual point
//    of a "supply chain smart contract": the rules are enforced by code
//    everyone can audit, not by which button the frontend happens to
//    show.
//
//    Only the contract `owner` (the deployer) can call assignRole(). In
//    this project, the backend server (blockchain/server.js) calls it
//    automatically right after a new user signs up, using the same
//    account that deployed the contract.
//
// 2. ENFORCED TRANSFER ORDER
//    require() checks in transferOwnership() now enforce:
//      Manufacturer -> Transporter only
//      Transporter  -> Distributor only
//      Distributor  -> Pharmacy only
//      Pharmacy     -> cannot transfer at all (see DELIVERY STATUS below)
//    This directly fixes "a batch skipping a stage" — that is now
//    impossible, not just hidden.
//    NOTE: the old "Wholesaler" role was removed and replaced with
//    "Transporter", and it now sits right after the Manufacturer
//    (Manufacturer -> Transporter -> Distributor -> Pharmacy) instead of
//    right before the Pharmacy.
//
// 3. MANUFACTURE DATE + EXPIRY DATE on the Batch struct.
//    Passed in at registration as Unix timestamps (seconds), same
//    representation as createdAt, so the frontend can format them
//    consistently and compute "is this batch expired?" locally.
//
// 4. DELIVERY STATUS instead of ownership transfer at the pharmacy stage.
//    A Pharmacy cannot transfer a batch onward (there is no next stage —
//    the patient/consumer isn't a blockchain participant who receives
//    on-chain ownership). Instead, once a Pharmacy owns a batch, they
//    call markDelivered() to record Delivered / NotDelivered — this
//    matches how a real dispensing step works (the medicine leaves the
//    tracked chain into a patient's hands) while still leaving a
//    permanent, auditable record of the outcome.
//
// 5. CONSUMERS ARE NOT ACCOUNTS ANYMORE.
//    There used to be a "Consumer" role you could sign up as. That's
//    gone — a consumer is just a member of the public checking a
//    tablet, so they should never need MetaMask, a password, or a
//    wallet at all. They can already call getBatch()/read events like
//    anyone else (all read functions are public `view`). The only
//    consumer-facing write is submitRating() below, which deliberately
//    has NO role requirement, because the person calling it has no
//    on-chain identity — the backend relays that one transaction on
//    their behalf using its own funded wallet (see server.js
//    POST /rate-batch), so no MetaMask popup is ever shown to a
//    consumer.
//
// 6. RATING + FEEDBACK (new: `ratingSum`/`ratingCount` on Batch +
//    `submitRating`, now with name/city/feedback text)
//    Lets a consumer who has verified a batch leave a 1-5 star rating
//    plus optional written feedback, an optional name, and a required
//    city. Stars are stored as a running sum + count (not a float)
//    because Solidity has no decimals — the frontend divides
//    sum/count to show an average. Name/city/feedback are NOT stored in
//    contract storage (that would be expensive and unnecessary) — they
//    only ever live in the RatingSubmitted event log, which is exactly
//    how this app already reads its whole history timeline. Gated so a
//    rating can only be submitted once the Pharmacy has marked the
//    batch Delivered (see the require in submitRating) — there's
//    nothing for a real consumer to review before that point.
//
// 7. PARTICIPANT-TO-PARTICIPANT RATING (new: `lastTransferFrom` on Batch,
//    `rateParticipant`, `positiveRatingsReceived`/`negativeRatingsReceived`)
//    Distinct from the consumer's 1-5 star product rating above — this
//    is a simple thumbs up/down that whoever RECEIVES a batch can give
//    to whoever they received it FROM, once per batch: a Transporter
//    rates the Manufacturer, a Distributor rates the Transporter, a
//    Pharmacy rates the Distributor. `lastTransferFrom` records who
//    handed the batch to the current owner, so the contract can verify
//    the rating targets the right person and can't be submitted twice
//    for the same batch. Ratings accumulate per-address across every
//    batch that participant has ever handled, which is what the
//    Welcome screen's Positive/Negative Ratings totals read from.
//
// WHAT DID NOT CHANGE:
// - batchCode uniqueness, numeric id, createdAt, event-based history —
//   all identical in spirit to the previous version.

contract SupplyChain {

    enum Role { None, Manufacturer, Transporter, Distributor, Pharmacy }
    enum DeliveryStatus { Pending, Delivered, NotDelivered }

    struct Batch {
        uint id;
        string batchCode;
        string productName;
        address manufacturer;
        uint quantity;
        address currentOwner;
        uint256 createdAt;
        uint256 manufactureDate; // Unix timestamp, provided at registration
        uint256 expiryDate;      // Unix timestamp, provided at registration
        DeliveryStatus deliveryStatus;
        uint256 ratingSum;       // sum of every star rating submitted (1-5 each)
        uint256 ratingCount;     // how many ratings have been submitted
        address lastTransferFrom; // who handed this batch to currentOwner (0x0 if never transferred)
    }

    address public owner; // the deployer — only address allowed to assign roles

    mapping(uint => Batch) public batches;
    mapping(string => uint) private batchCodeToId;
    mapping(address => Role) public roles;
    uint public batchCount = 0;

    // NEW: participant-to-participant rating totals (thumbs up/down),
    // separate from the consumer's product star rating above.
    mapping(address => uint256) public positiveRatingsReceived;
    mapping(address => uint256) public negativeRatingsReceived;
    // Prevents rating the same handoff twice for the same batch.
    mapping(uint => mapping(address => bool)) public hasRatedTransferFrom;

    event BatchRegistered(
        uint id,
        string batchCode,
        address owner,
        uint256 manufactureDate,
        uint256 expiryDate,
        uint256 timestamp
    );

    event OwnershipTransferred(
        uint id,
        address from,
        address to,
        uint256 timestamp
    );

    event DeliveryStatusUpdated(
        uint id,
        address pharmacy,
        DeliveryStatus status,
        uint256 timestamp
    );

    event RoleAssigned(address indexed user, Role role);

    event RatingSubmitted(
        uint id,
        uint8 rating,
        string name,
        string city,
        string feedback,
        uint256 timestamp
    );

    // NEW: participant-to-participant thumbs up/down.
    event ParticipantRated(
        uint id,
        address indexed rater,
        address indexed rated,
        bool positive,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the contract owner can do this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * Assign a role to a wallet address. Called once per user, right
     * after they sign up, by the backend (using the deployer account).
     */
    function assignRole(address _user, Role _role) public onlyOwner {
        roles[_user] = _role;
        emit RoleAssigned(_user, _role);
    }

    /**
     * Register a new medicine batch. Only wallets assigned the
     * Manufacturer role may call this.
     */
    function registerBatch(
        string memory _name,
        string memory _batchCode,
        uint _quantity,
        uint256 _manufactureDate,
        uint256 _expiryDate
    ) public {
        require(roles[msg.sender] == Role.Manufacturer, "Only a Manufacturer can register a batch");
        require(bytes(_batchCode).length > 0, "Batch code cannot be empty");
        require(batchCodeToId[_batchCode] == 0, "Batch code already exists");
        require(_expiryDate > _manufactureDate, "Expiry date must be after manufacture date");

        batchCount++;

        batches[batchCount] = Batch(
            batchCount,
            _batchCode,
            _name,
            msg.sender,
            _quantity,
            msg.sender,
            block.timestamp,
            _manufactureDate,
            _expiryDate,
            DeliveryStatus.Pending,
            0,
            0,
            address(0) // lastTransferFrom — nobody, this batch was just created
        );

        batchCodeToId[_batchCode] = batchCount;

        emit BatchRegistered(batchCount, _batchCode, msg.sender, _manufactureDate, _expiryDate, block.timestamp);
    }

    /**
     * Transfer ownership of a batch to a new wallet address.
     * SECURITY RULES:
     *   - only the CURRENT OWNER may call this successfully (unchanged
     *     from previous version).
     *   - the transfer must follow the real supply-chain order:
     *     Manufacturer -> Transporter -> Distributor -> Pharmacy.
     *     A Pharmacy cannot call this at all (see markDelivered below).
     */
    function transferOwnership(uint _id, address _newOwner) public {
        require(batches[_id].id != 0, "Batch does not exist");
        require(batches[_id].currentOwner == msg.sender, "Only the current owner can transfer this batch");
        require(_newOwner != address(0), "Invalid new owner address");

        Role senderRole = roles[msg.sender];
        Role recipientRole = roles[_newOwner];

        if (senderRole == Role.Manufacturer) {
            require(recipientRole == Role.Transporter, "Manufacturer can only transfer to a Transporter");
        } else if (senderRole == Role.Transporter) {
            require(recipientRole == Role.Distributor, "Transporter can only transfer to a Distributor");
        } else if (senderRole == Role.Distributor) {
            require(recipientRole == Role.Pharmacy, "Distributor can only transfer to a Pharmacy");
        } else {
            revert("This role is not permitted to transfer ownership");
        }

        address previousOwner = batches[_id].currentOwner;
        batches[_id].currentOwner = _newOwner;
        // NEW: record who the NEW owner received this batch from, so
        // they can rate that person once via rateParticipant() below.
        batches[_id].lastTransferFrom = previousOwner;

        emit OwnershipTransferred(_id, previousOwner, _newOwner, block.timestamp);
    }

    /**
     * NEW: the current owner rates whoever handed them this batch —
     * Transporter rates Manufacturer, Distributor rates Transporter,
     * Pharmacy rates Distributor. Once per batch (enforced by
     * hasRatedTransferFrom). Purely reputational — does not affect
     * whether transfers succeed.
     */
    function rateParticipant(uint _id, bool _positive) public {
        require(batches[_id].id != 0, "Batch does not exist");
        require(batches[_id].currentOwner == msg.sender, "Only the current owner can rate the previous holder");
        address ratedAddress = batches[_id].lastTransferFrom;
        require(ratedAddress != address(0), "No previous holder to rate for this batch");
        require(!hasRatedTransferFrom[_id][msg.sender], "You already rated the previous holder for this batch");

        hasRatedTransferFrom[_id][msg.sender] = true;

        if (_positive) {
            positiveRatingsReceived[ratedAddress] += 1;
        } else {
            negativeRatingsReceived[ratedAddress] += 1;
        }

        emit ParticipantRated(_id, msg.sender, ratedAddress, _positive, block.timestamp);
    }

    /**
     * NEW: Pharmacy-only. Records whether the batch was successfully
     * dispensed to the patient. Replaces "transfer ownership" at the
     * final stage, since there is no further on-chain participant to
     * hand the batch to.
     */
    function markDelivered(uint _id, bool _delivered) public {
        require(batches[_id].id != 0, "Batch does not exist");
        require(roles[msg.sender] == Role.Pharmacy, "Only a Pharmacy can update delivery status");
        require(batches[_id].currentOwner == msg.sender, "Only the current owner can update delivery status");

        DeliveryStatus status = _delivered ? DeliveryStatus.Delivered : DeliveryStatus.NotDelivered;
        batches[_id].deliveryStatus = status;

        emit DeliveryStatusUpdated(_id, msg.sender, status, block.timestamp);
    }

    /**
     * NEW: Consumer rating + optional feedback. Deliberately has NO
     * role/owner restriction — whoever calls it just needs SOME funded
     * wallet to pay gas, which for a consumer (who has no account in
     * this app) is the backend's own wallet, relaying on their behalf
     * (see server.js POST /rate-batch).
     *
     * GATED ON DELIVERY: a consumer can only rate/give feedback once
     * the batch has actually reached them — i.e. the Pharmacy has
     * called markDelivered(true). Before that, there's nothing for a
     * real consumer to have an opinion about yet, so this reverts.
     *
     * _name is optional (pass "" to stay anonymous — the frontend then
     * shows "Anonymous"). _city is REQUIRED. _feedback is optional free
     * text (pass "" to just leave a star rating with no comment).
     */
    function submitRating(
        uint _id,
        uint8 _rating,
        string memory _name,
        string memory _city,
        string memory _feedback
    ) public {
        require(batches[_id].id != 0, "Batch does not exist");
        require(
            batches[_id].deliveryStatus == DeliveryStatus.Delivered,
            "Rating and feedback are only available after the pharmacy marks this batch as delivered"
        );
        require(_rating >= 1 && _rating <= 5, "Rating must be between 1 and 5");
        require(bytes(_city).length > 0, "City is required");

        batches[_id].ratingSum += _rating;
        batches[_id].ratingCount += 1;

        emit RatingSubmitted(_id, _rating, _name, _city, _feedback, block.timestamp);
    }

    function getBatch(uint _id) public view returns (Batch memory) {
        return batches[_id];
    }

    function getIdByCode(string memory _batchCode) public view returns (uint) {
        return batchCodeToId[_batchCode];
    }

    function isBatchCodeUsed(string memory _batchCode) public view returns (bool) {
        return batchCodeToId[_batchCode] != 0;
    }

    function getRole(address _user) public view returns (Role) {
        return roles[_user];
    }
}
