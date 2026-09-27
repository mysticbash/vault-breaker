// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VaultArena} from "../src/VaultArena.sol";

/**
 * Deploys VaultArena and registers the 5 guardian agents with seeded pools.
 * Env: VAULT_DEPLOYER_KEY (private key), RPC via --rpc-url.
 */
contract DeployVaultArena is Script {
    // Guardians: codename, art seed (sigil), salt, secret key, seed pool (ether)
    struct Guardian {
        string codename;
        string artSeed;
        bytes32 salt;
        string secret;
        uint256 seed;
    }

    function guardians() internal pure returns (Guardian[] memory g) {
        g = new Guardian[](5);
        g[0] = Guardian("The Architect", "glyph:architect", bytes32(uint256(0x1010101010101010101010101010101010101010101010101010101010101010)), "OBSIDIAN SPIRE", 0.5 ether);
        g[1] = Guardian("Siren 7", "glyph:siren", bytes32(uint256(0x0505050505050505050505050505050505050505050505050505050505050505)), "SALT MOON", 0.3 ether);
        g[2] = Guardian("Neon Ghost", "glyph:ghost", bytes32(uint256(0x0909090909090909090909090909090909090909090909090909090909090909)), "WIRE LOTUS", 0.25 ether);
        g[3] = Guardian("Null Vector", "glyph:null", bytes32(uint256(0x1414141414141414141414141414141414141414141414141414141414141414)), "ZERO HARVEST", 0.15 ether);
        g[4] = Guardian("Warden Kade", "glyph:warden", bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222)), "IRON VESPER", 0.4 ether);
    }

    /// @dev Sum of the per-guardian weights above; used to rescale to the funded total.
    uint256 internal constant WEIGHT_TOTAL = 1.6 ether;

    function run() external {
        uint256 deployerKey = vm.envUint("VAULT_DEPLOYER_KEY");
        // Total MON seeded across all guardians; testnet faucets are stingy, so
        // the split is rescaled rather than hardcoded per agent.
        uint256 totalPool = vm.envOr("VAULT_TOTAL_POOL_WEI", uint256(5 ether));
        vm.startBroadcast(deployerKey);

        VaultArena arena = new VaultArena();
        console2.log("VaultArena deployed at:", address(arena));

        Guardian[] memory g = guardians();
        for (uint256 i = 0; i < g.length; i++) {
            uint256 seed = (g[i].seed * totalPool) / WEIGHT_TOTAL;
            bytes32 keyHash = arena.computeKeyHash(g[i].salt, g[i].secret);
            uint256 id = arena.registerAgent{value: seed}(g[i].codename, g[i].artSeed, g[i].salt, keyHash);
            console2.log("registered agent:");
            console2.log("  id:", id);
            console2.log("  codename:", g[i].codename);
            console2.log("  pool:", seed);
        }

        vm.stopBroadcast();
    }
}
