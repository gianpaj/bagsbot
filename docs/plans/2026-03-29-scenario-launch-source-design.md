# Scenario Launch Source Design

## Goal

Enable reliable local/testnet validation of the Bags bot pipeline without depending on the live Bags restream or real Bags-listed coins.

## Problem

Switching `SOLANA_RPC_URL` to testnet only changes Solana RPC calls. The bot still listens to the live Bags restream, so no synthetic opportunities appear. A second issue is that the current filter pipeline depends on creator, social, and liquidity services. Injecting only fake launch events is not enough to create meaningful pass/fail variation.

## Chosen Approach

Introduce a pluggable launch-source runtime:

- `launchSource.type = live | scenario`
- `ScenarioRestreamClient` implements the existing `IRestreamClient` contract
- scenario presets emit `LaunchpadLaunchEvent` objects on a timer and loop continuously
- scenario mode also injects filter-service overrides so creator, social, and liquidity filters see consistent synthetic data
- trade execution is blocked in scenario mode by default

This keeps the existing bot pipeline intact:

1. launch source emits launch events
2. filters evaluate using either live or scenario-backed services
3. scoring and alert queue behave normally
4. headless/UI flows still work
5. trade execution is explicitly disabled for safety

## Presets

The initial scenario preset is `mixed-opportunities`, a loop of synthetic launches representing:

- high-conviction token
- borderline opportunity
- strong technicals but weak creator signal
- liquidity trap

These cover both queue-worthy and rejected opportunities.

## Implementation Notes

- add config/env support for launch source selection and scenario timing
- add a launch-source factory used by `src/index.ts`
- extend filter registry to accept service overrides
- add runtime tests for scenario emission and config wiring
- add a bot test ensuring scenario-mode buy attempts do not reach trade execution

## Non-Goals

- simulating real on-chain Bags launches
- minting SPL tokens on testnet
- mock-success trade execution
