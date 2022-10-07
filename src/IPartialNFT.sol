// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IPartialNFT {
  function isApprovedForAll(address account, address operator)
    external
    view
    returns (bool);
}
