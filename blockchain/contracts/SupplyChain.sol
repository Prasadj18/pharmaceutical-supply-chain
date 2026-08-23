// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SupplyChain {

    // =========================================================
    // ROLES
    // =========================================================

    enum Role {
        NONE,
        ADMIN,
        MANUFACTURER,
        TRANSPORTER,
        DISTRIBUTOR,
        PHARMACY
    }

    mapping(address => Role) public roles;

    // =========================================================
    // BATCH STATUS
    // =========================================================

    enum BatchStatus {
        MANUFACTURED,
        IN_TRANSIT,
        AT_DISTRIBUTOR,
        AT_PHARMACY,
        DELIVERED,
        REJECTED,
        EXPIRED
    }

    // =========================================================
    // BATCH STRUCTURE
    // =========================================================

    struct Batch {

        uint256 id;

        string productName;

        uint256 quantity;

        uint256 manufactureDate;

        uint256 expiryDate;

        address manufacturer;

        address currentOwner;

        BatchStatus status;

        bool exists;
    }

    // =========================================================
    // OWNERSHIP HISTORY
    // =========================================================

    struct OwnershipRecord {

        address owner;

        uint256 timestamp;
    }

    // =========================================================
    // STORAGE
    // =========================================================

    uint256 private nextBatchId = 1;

    mapping(uint256 => Batch) public batches;

    mapping(
        uint256 => OwnershipRecord[]
    ) private ownershipHistory;

    // =========================================================
    // EVENTS
    // =========================================================

    event RoleAssigned(
        address indexed account,
        Role role
    );

    event BatchRegistered(
        uint256 indexed batchId,
        string productName,
        address indexed manufacturer
    );

    event OwnershipTransferred(
        uint256 indexed batchId,
        address indexed previousOwner,
        address indexed newOwner
    );

    event BatchStatusUpdated(
        uint256 indexed batchId,
        BatchStatus status
    );

    // =========================================================
    // MODIFIERS
    // =========================================================

    modifier onlyAdmin() {

        require(
            roles[msg.sender] == Role.ADMIN,
            "Only admin can perform this action"
        );

        _;
    }

    modifier onlyManufacturer() {

        require(
            roles[msg.sender] == Role.MANUFACTURER,
            "Only manufacturer can perform this action"
        );

        _;
    }

    modifier onlyCurrentOwner(uint256 batchId) {

        require(
            batches[batchId].exists,
            "Batch does not exist"
        );

        require(
            batches[batchId].currentOwner == msg.sender,
            "Only current owner can perform this action"
        );

        _;
    }

    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    constructor() {

        roles[msg.sender] = Role.ADMIN;

        emit RoleAssigned(
            msg.sender,
            Role.ADMIN
        );
    }

    // =========================================================
    // ROLE MANAGEMENT
    // =========================================================

    function assignRole(
        address account,
        Role role
    )
        external
        onlyAdmin
    {

        require(
            account != address(0),
            "Invalid address"
        );

        require(
            role != Role.NONE,
            "Invalid role"
        );

        roles[account] = role;

        emit RoleAssigned(
            account,
            role
        );
    }

    // =========================================================
    // REGISTER BATCH
    // =========================================================

    function registerBatch(
        string memory productName,
        uint256 quantity,
        uint256 manufactureDate,
        uint256 expiryDate
    )
        external
        onlyManufacturer
        returns (uint256)
    {

        require(
            bytes(productName).length > 0,
            "Product name required"
        );

        require(
            quantity > 0,
            "Quantity must be greater than zero"
        );

        require(
            expiryDate > manufactureDate,
            "Invalid expiry date"
        );

        uint256 batchId = nextBatchId;

        nextBatchId++;

        batches[batchId] = Batch({

            id: batchId,

            productName: productName,

            quantity: quantity,

            manufactureDate: manufactureDate,

            expiryDate: expiryDate,

            manufacturer: msg.sender,

            currentOwner: msg.sender,

            status: BatchStatus.MANUFACTURED,

            exists: true
        });

        ownershipHistory[batchId].push(
            OwnershipRecord({

                owner: msg.sender,

                timestamp: block.timestamp
            })
        );

        emit BatchRegistered(
            batchId,
            productName,
            msg.sender
        );

        return batchId;
    }

    // =========================================================
    // TRANSFER OWNERSHIP
    // =========================================================

    function transferOwnership(
        uint256 batchId,
        address newOwner
    )
        external
        onlyCurrentOwner(batchId)
    {

        require(
            newOwner != address(0),
            "Invalid new owner"
        );

        address previousOwner =
            batches[batchId].currentOwner;

        batches[batchId].currentOwner =
            newOwner;

        batches[batchId].status =
            BatchStatus.IN_TRANSIT;

        ownershipHistory[batchId].push(
            OwnershipRecord({

                owner: newOwner,

                timestamp: block.timestamp
            })
        );

        emit OwnershipTransferred(
            batchId,
            previousOwner,
            newOwner
        );

        emit BatchStatusUpdated(
            batchId,
            BatchStatus.IN_TRANSIT
        );
    }

    // =========================================================
    // UPDATE STATUS
    // =========================================================

    function updateBatchStatus(
    uint256 batchId,
    BatchStatus newStatus
    )
    external
    onlyCurrentOwner(batchId)
    {
        require(
            batches[batchId].exists,
            "Batch does not exist"
        );

        Role senderRole = roles[msg.sender];

        // ---------------------------------------------------------
        // DISTRIBUTOR STATUS
        // ---------------------------------------------------------

        if (newStatus == BatchStatus.AT_DISTRIBUTOR) {

            require(
                senderRole == Role.DISTRIBUTOR,
                "Only distributor can set AT_DISTRIBUTOR"
            );
        }

        // ---------------------------------------------------------
        // PHARMACY STATUS
        // ---------------------------------------------------------

        if (newStatus == BatchStatus.AT_PHARMACY) {

            require(
                senderRole == Role.PHARMACY,
                "Only pharmacy can set AT_PHARMACY"
            );
        }

        // ---------------------------------------------------------
        // DELIVERED STATUS
        // ---------------------------------------------------------

        if (newStatus == BatchStatus.DELIVERED) {

            require(
                senderRole == Role.PHARMACY,
                "Only pharmacy can mark delivered"
            );
        }

        // ---------------------------------------------------------
        // REJECTED STATUS
        // ---------------------------------------------------------

        if (newStatus == BatchStatus.REJECTED) {

            require(
                senderRole == Role.PHARMACY,
                "Only pharmacy can reject batch"
            );
        }

        // ---------------------------------------------------------
        // EXPIRED STATUS
        // ---------------------------------------------------------

        if (newStatus == BatchStatus.EXPIRED) {

            require(
                block.timestamp > batches[batchId].expiryDate,
                "Batch has not expired"
            );
        }

        // ---------------------------------------------------------
        // PREVENT MANUAL IN_TRANSIT
        // ---------------------------------------------------------

        if (newStatus == BatchStatus.IN_TRANSIT) {

            revert(
                "IN_TRANSIT is set automatically during ownership transfer"
            );
        }

        // ---------------------------------------------------------
        // UPDATE STATUS
        // ---------------------------------------------------------

        batches[batchId].status =
            newStatus;

        emit BatchStatusUpdated(
            batchId,
            newStatus
        );
    }

    // =========================================================
    // GET BATCH
    // =========================================================

    function getBatch(
        uint256 batchId
    )
        external
        view
        returns (
            uint256 id,
            string memory productName,
            uint256 quantity,
            uint256 manufactureDate,
            uint256 expiryDate,
            address manufacturer,
            address currentOwner,
            BatchStatus status,
            bool exists
        )
    {

        Batch memory batch =
            batches[batchId];

        return (

            batch.id,

            batch.productName,

            batch.quantity,

            batch.manufactureDate,

            batch.expiryDate,

            batch.manufacturer,

            batch.currentOwner,

            batch.status,

            batch.exists
        );
    }

    // =========================================================
    // GET ROLE
    // =========================================================

    function getRole(
        address account
    )
        external
        view
        returns (Role)
    {

        return roles[account];
    }

    // =========================================================
    // GET OWNERSHIP HISTORY
    // =========================================================

    function getOwnershipHistory(
        uint256 batchId
    )
        external
        view
        returns (
            OwnershipRecord[] memory
        )
    {

        return ownershipHistory[batchId];
    }
}