# Market Simulation Design

## Goal

Provide a paper-trading runtime that exercises the same end-to-end bot flow as live mode without using mainnet funds or real Bags markets.

This runtime should support two distinct use cases:

- interactive simulation for quick manual testing
- deterministic history-driven simulation for end-to-end and backtesting-style runs

## Naming

Use `market simulation` as the umbrella concept.

- `live` means the current production runtime
- `simulation` means a paper-trading runtime with synthetic or replayed market behavior

The earlier `scenario` concept becomes one input style inside simulation, not the top-level name.

## Entry Points

Do not add more environment-variable modes for these workflows. The user-facing entry points should be separate scripts because the use cases are different.

Recommended scripts:

- `bun run dev` for live trading
- `bun run simulate` for generated market simulation
- `bun run simulate:history -- <file>` for deterministic history-driven simulation

## Chosen Architecture

Add one shared simulation engine that can power both generated and history-driven runs.

The engine owns:

- a launch source
- a paper trade adapter
- a market model
- a simulated position and exit feed

This keeps the application flow aligned with live mode:

1. launch source emits launches
2. filters and scoring evaluate them
3. opportunities are queued
4. trade executor runs against a paper trade adapter
5. positions are opened
6. price updates and exit checks continue over time

Only the backing services change between live and simulation.

## Runtime Modes

### Generated Simulation

Used for fast interactive testing.

Characteristics:

- launches are generated from reusable profiles such as high-conviction or liquidity-trap
- price movement is rule-based and partially random
- quotes, prepared swaps, fills, and signatures are simulated
- positions and exits evolve over time without touching the network

This mode is optimized for manual validation of the bot while it is running.

### History-Driven Simulation

Used for deterministic e2e and backtesting-style runs.

Characteristics:

- launches and market states are loaded from a file
- price movement is replayed from recorded or generated history
- paper fills and exits are deterministic
- repeated runs with the same file should produce the same outcomes

This mode is optimized for regression testing and reproducible demonstrations.

## Shared Simulation Responsibilities

### Paper Trade Adapter

Replace the live Bags trade adapter with a simulation adapter that:

- returns a synthetic quote
- returns a prepared swap object without building a real transaction
- returns simulated execution success
- produces stable mock signatures and token amounts

The rest of the trading flow should remain unchanged so position creation, UI updates, and reporting still follow the production path.

### Market Model

The market model drives paper price movement after entry.

For generated simulation:

- use token-profile rules plus randomness
- allow profiles to express drift, volatility, pump probability, and collapse probability

For history-driven simulation:

- read the next market state from the input file
- do not introduce randomness unless explicitly requested

### Exit Feed

Feed the existing exit-monitor and position logic with simulated current prices so take-profit and stop-loss behavior can be tested as if the bot were live.

## Design Principles

- keep the production control flow intact
- centralize simulation logic in one runtime instead of scattering checks across unrelated modules
- prefer scripts over more mode flags for the user-facing workflows
- make generated simulation fast and convenient
- make history-driven simulation deterministic and reproducible

## Non-Goals

- sending real transactions from simulation mode
- depending on the live Bags restream in simulation mode
- requiring Solana testnet liquidity for paper trading

## Next Implementation Slice

The first implementation phase should cover:

- add `simulate` and `simulate:history` entry points
- introduce a shared simulation engine
- add a paper trade adapter that simulates quote, prepare, and execute success
- connect simulated prices to open positions and exits
- define one generated profile set and one history-file format
