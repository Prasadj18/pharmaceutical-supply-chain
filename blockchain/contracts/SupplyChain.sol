// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SupplyChain {

    struct Batch {
        uint id;
        string productName;
        address manufacturer;
        uint quantity;
        address currentOwner;
    }

    mapping(uint => Batch) public batches;
    uint public batchCount = 0;

    event BatchRegistered(uint id, address owner);
    event OwnershipTransferred(uint id, address newOwner);

    function registerBatch(string memory _name, uint _quantity) public {
        batchCount++;
        batches[batchCount] = Batch(
            batchCount,
            _name,
            msg.sender,
            _quantity,
            msg.sender
        );

        emit BatchRegistered(batchCount, msg.sender);
    }

    function transferOwnership(uint _id, address _newOwner) public {
        require(batches[_id].currentOwner == msg.sender, "Not owner");

        batches[_id].currentOwner = _newOwner;

        emit OwnershipTransferred(_id, _newOwner);
    }

    function getBatch(uint _id) public view returns (Batch memory) {
        return batches[_id];
    }
}