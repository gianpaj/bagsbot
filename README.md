# BagsBot

A TypeScript CLI bot for monitoring Solana token launches on the [Bags](https://bags.fm) platform. Features real-time detection, multi-signal scoring, semi-automated trading, and full position management.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Architecture](#architecture)
- [Development](#development)
- [Risk Disclaimer](#risk-disclaimer)
- [License](#license)

## Features

| Feature | Description |
|---------|-------------|
| Real-Time Detection | Connects to Bags Restream API for instant launch notifications |
| Multi-Signal Filters | Evaluates creator history, technical metadata, social presence, and liquidity |
| Confidence Scoring | 0-100 score based on weighted filter results |
| Semi-Auto Trading | Review opportunities and confirm with one keypress |
| Position Sizing | Automatic calculation based on portfolio percentage |
| Exit Management | Configurable take-profit (default 10x) and stop-loss (default -50%) |
| Agent-Centric Dashboard | TradingAgents-style TUI with progress, event log, current report, and footer metrics |

### Filter Stack

```
Launch Detected
      |
      v
+------------------+
| CREATOR FILTER   | --> Verified social? Account history? Past launches?
+------------------+
      |
      v
+------------------+
| TECHNICAL FILTER | --> Complete metadata? Valid image? Description?
+------------------+
      |
      v
+------------------+
| SOCIAL FILTER    | --> Twitter linked? Community size?
+------------------+
      |
      v
+------------------+
| LIQUIDITY FILTER | --> Sufficient liquidity? No whale concentration?
+------------------+
      |
      v
   SCORE >= 60?
      |
      v
   ALERT USER
```

## Prerequisites

### Node.js

Node.js version 22.0.0 or higher is required.

```bash
# Check your Node.js version
node --version

# Install via nvm (recommended)
nvm install 22
nvm use 22
```

### Zig

Zig is required for the OpenTUI terminal interface to compile native components.

**macOS:**
```bash
brew install zig
```

**Linux (Debian/Ubuntu):**
```bash
# Download from https://ziglang.org/download/
# Or use snap:
snap install zig --classic --beta
```

**Windows:**
Download the latest release from https://ziglang.org/download/ and add to your PATH.

Verify installation:
```bash
zig version
```

### Solana Wallet

You need a Solana wallet keypair file for trading. Create one using the Solana CLI:

```bash
# Install Solana CLI (if not already installed)
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash

# Create a new keypair (or use an existing one)
solana-keygen new --outfile ~/.config/solana/id.json

solana config set --url testnet
```

**Security Warning:** Never share your keypair file or commit it to version control.

## Installation

```bash
# Clone the repository
git clone https://github.com/gianpaj/bagsbot.git
cd bagsbot

# Install dependencies
bun install

# Copy the environment template
cp .env.example .env

# Edit .env with your configuration (see Configuration section)

# Build the project
bun run build

# Run the bot
bun start
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Required: Your Bags API key
BAGS_API_KEY=your_bags_api_key_here

# Required: Solana RPC endpoint
# Use a quality RPC provider for production (Helius, QuickNode, Triton, etc.)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Required: Path to your wallet keypair file
WALLET_PATH=/path/to/your/wallet.json

# Optional UI override
# Set to false to force the OpenTUI dashboard
UI_HEADLESS=true

# Optional low-level launch source overrides
# Most users should prefer `bun run simulate` or `bun run simulate:history`
LAUNCH_SOURCE=live

# Optional low-level scenario settings (used when LAUNCH_SOURCE=scenario)
SCENARIO_NAME=mixed-opportunities
SCENARIO_INTERVAL_MS=2500
SCENARIO_DISABLE_TRADING=true
```

### Configuration File

The bot uses a configuration file at `~/.bagsbot/config.json`. Default values are used if this file doesn't exist.

#### Filter Configuration

```json
{
  "filters": {
    "creator": {
      "requireVerifiedSocial": true,
      "minFollowerCount": 100,
      "minAccountAgeDays": 7,
      "checkPreviousLaunches": true
    },
    "technical": {
      "requireCompleteMetadata": true,
      "requireDescription": true,
      "requireSocialLinks": false,
      "validateImageUrl": true
    },
    "social": {
      "checkTwitterMentions": true,
      "checkTelegramGroup": false,
      "minCommunitySize": 50
    },
    "liquidity": {
      "minInitialLiquiditySol": 0.5,
      "maxBondingCurvePercent": 80,
      "maxTopHolderPercent": 30
    }
  }
}
```

#### Scoring Configuration

```json
{
  "scoring": {
    "weights": {
      "creator": 0.3,
      "technical": 0.2,
      "social": 0.2,
      "liquidity": 0.3
    },
    "minScoreToAlert": 60,
    "minScoreForHighConfidence": 80
  }
}
```

#### Trading Configuration

```json
{
  "trading": {
    "slippageBps": 500,
    "priorityFeeLamports": 100000,
    "maxRetries": 3
  },
  "maxPositionPercent": 2,
  "maxOpenPositions": 10
}
```

#### Exit Configuration

```json
{
  "exits": {
    "takeProfitPercent": 900,
    "stopLossPercent": -50,
    "checkIntervalMs": 5000,
    "autoSellEnabled": false
  }
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `takeProfitPercent` | Percentage gain to trigger take-profit (900 = 10x) | 900 |
| `stopLossPercent` | Percentage loss to trigger stop-loss | -50 |
| `checkIntervalMs` | How often to check exit conditions (ms) | 5000 |
| `autoSellEnabled` | Automatically sell when exit conditions are met | false |

## Usage

### Starting the Bot

```bash
# Production mode (uses compiled JavaScript)
bun start

# Development mode (uses TypeScript directly with hot reload)
bun run dev

# Interactive paper-trading market simulation
bun run simulate

# Deterministic history-driven simulation
bun run simulate:history -- tests/fixtures/simulation-history.sample.json
```

### Market Simulation

Using `SOLANA_RPC_URL=https://api.testnet.solana.com` does not make the live Bags restream produce testnet launches. If you want paper trading or reproducible testing, use the dedicated simulation scripts.

```bash
BAGS_API_KEY=your_bags_api_key_here
SOLANA_RPC_URL=https://api.testnet.solana.com
WALLET_PATH=~/.config/solana/id.json
```

Start interactive paper trading:

```bash
bun run simulate
```

Start deterministic history replay:

```bash
bun run simulate:history -- tests/fixtures/simulation-history.sample.json
```

The interactive simulation uses the bundled `mixed-opportunities` market profile, which loops through four synthetic launch types:

- `high-conviction`: strong creator, social, and liquidity signals
- `borderline`: barely clears the alert threshold
- `weak-creator`: polished metadata with weak creator trust
- `liquidity-trap`: attractive surface signals with bad liquidity metrics

Simulation mode paper-trades the full bot flow:

- launches are injected locally
- quotes, prepared swaps, fills, and signatures are simulated
- positions are opened normally
- prices evolve over time
- exit signals trigger from simulated prices

### Dashboard Controls

| Key | Action |
|-----|--------|
| `↑` / `k` | Select previous tracked coin |
| `↓` / `j` | Select next tracked coin |
| `b` | Buy the selected pending opportunity at the suggested amount |
| `s` | Skip/reject the selected pending opportunity |
| `` ` `` | Toggle the raw log drawer |
| `Ctrl+Y` | Copy the current raw-log selection from the console drawer |
| `Ctrl+P` / `Ctrl+O` | Move the console drawer between dock positions |
| `+` / `-` | Resize the console drawer |
| `Q` | Quit the bot |

### Dashboard Layout

The main bot UI is now a fixed three-area dashboard:

- `Progress`: tracked launches and opportunities, rendered as an agent pipeline per coin
- `Messages & Tools`: reverse-chronological execution log of tool, reasoning, and system events
- `Current Report / New Analysis`: synthesized analysis for the currently selected coin
- `Raw Logs`: an OpenTUI dockable console drawer for intercepted stdout/stderr and copyable low-level logs
- footer: tracked items, active opportunities, open positions, tool-call count, generated reports, and uptime

Selection is keyboard-driven and item-centric. The bottom report pane always follows the currently selected tracked coin.

### Workflow

1. **Launch Detection**: The bot connects to Bags Restream and starts tracking new coins as soon as launch events arrive.
2. **Agent Pipeline Rendering**: Each tracked coin is shown through a subsystem pipeline:
   - `Launch Listener`
   - `Creator Analyst`
   - `Technical Analyst`
   - `Social Analyst`
   - `Liquidity Analyst`
   - `Scoring Agent`
   - `Opportunity Manager`
   - `Trader`
   - `Position Monitor`
3. **Filtering and Scoring**: The real filter pipeline runs, then the scoring engine calculates a weighted 0-100 score and confidence level.
4. **Opportunity Creation**: Coins above the alert threshold become pending opportunities with a suggested SOL amount.
5. **Review by Selection**: You move through tracked coins with the keyboard and inspect the current report for the selected item.
6. **Trade Decision**: Press `b` to buy the selected pending opportunity or `s` to reject it.
7. **Position and Exit Monitoring**: Executed trades become tracked positions and continue updating the dashboard as exit signals fire.

## Architecture

```text
Restream Listener
        |
        v
Filter Pipeline -> Scoring Engine
        |
        v
   Alert System
        |
        +--------------------------+
        |                          |
        v                          v
 Trade Executor              Dashboard State
        |                          |
        v                          v
 Position Manager <---- Exit Monitor
        |
        v
 OpenTUI Dashboard
```

### UI Data Flow

The terminal UI is now store-driven rather than screen-driven:

1. `BagsBot` emits structured lifecycle updates for launches, analysis, opportunities, trades, positions, and exits.
2. `src/ui/dashboard-state.ts` turns those updates into tracked items, agent statuses, event log entries, synthesized report text, and footer metrics.
3. `src/ui/layout.ts` renders the full dashboard from that derived state.
4. `src/ui/app.ts` bridges keyboard input and bot events into the store.

### Module Overview

| Module | Path | Purpose |
|--------|------|---------|
| Restream Listener | `src/listeners/restream.ts` | Connects to Bags Restream API |
| Filter Pipeline | `src/filters/pipeline.ts` | Orchestrates filter evaluation |
| Creator Filter | `src/filters/creator.ts` | Validates creator credentials |
| Technical Filter | `src/filters/technical.ts` | Checks metadata quality |
| Social Filter | `src/filters/social.ts` | Evaluates social presence |
| Liquidity Filter | `src/filters/liquidity.ts` | Analyzes liquidity metrics |
| Scoring Engine | `src/scoring/engine.ts` | Calculates weighted scores |
| Alert System | `src/alerts/system.ts` | Manages opportunity queue and lifecycle notifications |
| Trade Executor | `src/trading/executor.ts` | Executes swap transactions |
| Wallet Manager | `src/trading/wallet.ts` | Handles wallet operations |
| Position Manager | `src/positions/manager.ts` | Tracks open positions |
| Exit Monitor | `src/exits/monitor.ts` | Monitors TP/SL conditions |
| OpenTUI App | `src/ui/app.ts` | Dashboard runtime and keyboard bridge |
| Dashboard State | `src/ui/dashboard-state.ts` | Event-driven UI store for tracked items and reports |
| Dashboard Layout | `src/ui/layout.ts` | TradingAgents-style three-pane renderer |

## Development

### Commands

```bash
# Run in development mode
bun run dev

# Run tests
bun test

# Run tests once (no watch)
bun run test:run

# Type check
bun run typecheck

# Lint
bun run lint

# Fix lint issues
bun run lint:fix

# Format code
bun run format

# Check formatting
bun run format:check

# Build
bun run build
```

### Project Structure

```
bagsbot/
|-- src/
|   |-- index.ts              # Entry point
|   |-- bot.ts                # Main orchestrator
|   |-- config/               # Configuration system
|   |-- listeners/            # Restream connection
|   |-- filters/              # Filter implementations
|   |-- scoring/              # Scoring engine
|   |-- alerts/               # Alert queue system
|   |-- trading/              # Trade execution
|   |-- positions/            # Position management
|   |-- exits/                # Exit monitoring
|   |-- ui/                   # Terminal UI
|   |   |-- app.ts            # Dashboard runtime and key handling
|   |   |-- dashboard-state.ts# UI event/state store
|   |   +-- layout.ts         # Three-pane dashboard renderer
|   |-- types/                # TypeScript types
|   |-- errors/               # Error classes
|   +-- utils/                # Utilities
|-- docs/
|   +-- plans/                # Design documents
|-- .env.example              # Environment template
|-- package.json
|-- tsconfig.json
+-- vitest.config.ts
```

### Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 18+
- **SDK**: `@bagsfm/bags-sdk` for Bags platform integration
- **Blockchain**: `@solana/web3.js` for Solana interactions
- **UI**: `@opentui/core` for the dashboard interface
- **Validation**: `zod` for schema validation
- **Testing**: Vitest
- **Linting**: ESLint + TypeScript ESLint
- **Formatting**: Prettier

## Risk Disclaimer

**This software trades real cryptocurrency with real money. Use at your own risk.**

### Financial Risks

- **Total Loss**: You can lose your entire investment. New tokens are highly speculative and most fail.
- **Volatility**: Prices can move rapidly. Your position may be worth significantly less within seconds.
- **Slippage**: Fast-moving markets may result in execution prices worse than quoted.
- **Failed Transactions**: Network congestion or RPC issues may cause transactions to fail or execute at unexpected prices.

### Technical Risks

- **Smart Contract Risk**: New tokens may contain malicious code. Filters reduce but do not eliminate this risk.
- **API Reliability**: The Bags Restream service may experience downtime or delays.
- **RPC Limits**: Solana RPC providers have rate limits that may affect performance.
- **Software Bugs**: Despite testing, this software may contain bugs that result in financial loss.

### Best Practices

1. **Start Small**: Begin with amounts you can afford to lose completely.
2. **Use a Dedicated Wallet**: Never use a wallet containing significant funds.
3. **Test on Devnet First**: Familiarize yourself with the bot's behavior before using real money.
4. **Monitor Actively**: Do not leave the bot unattended for extended periods.
5. **Keep Software Updated**: Always use the latest version.
6. **Secure Your Keys**: Never share your wallet keypair or commit it to version control.

### No Financial Advice

This software and its documentation do not constitute financial advice. The developers are not responsible for any financial losses incurred through the use of this software. Always do your own research (DYOR) before making any investment decisions.

**By using this software, you acknowledge that you understand these risks and accept full responsibility for any losses.**

## License

MIT License - See [LICENSE](LICENSE) for details.

---

**Built for the Bags community.**
