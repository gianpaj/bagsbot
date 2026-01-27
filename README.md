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
| Terminal UI | Rich TUI dashboard built with OpenTUI |

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

Node.js version 18.0.0 or higher is required.

```bash
# Check your Node.js version
node --version

# Install via nvm (recommended)
nvm install 18
nvm use 18
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
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Create a new keypair (or use an existing one)
solana-keygen new --outfile ~/.config/solana/id.json
```

**Security Warning:** Never share your keypair file or commit it to version control.

## Installation

```bash
# Clone the repository
git clone https://github.com/gianpaj/bagsbot.git
cd bagsbot

# Install dependencies
npm install

# Copy the environment template
cp .env.example .env

# Edit .env with your configuration (see Configuration section)

# Build the project
npm run build

# Run the bot
npm start
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
npm start

# Development mode (uses TypeScript directly with hot reload)
npm run dev
```

### Keybindings

| Key | Action |
|-----|--------|
| `Enter` | Confirm trade at suggested amount |
| `Esc` | Skip/reject current opportunity |
| `+` / `-` | Adjust position size |
| `P` | View positions screen |
| `H` | View trade history |
| `S` | Open settings |
| `Q` | Quit the bot |

### Workflow

1. **Launch Detection**: The bot connects to Bags Restream and monitors for new token launches.

2. **Filtering**: Each launch passes through the filter pipeline:
   - Creator filter checks social verification and launch history
   - Technical filter validates metadata completeness
   - Social filter evaluates community presence
   - Liquidity filter checks initial liquidity and holder distribution

3. **Scoring**: A weighted score (0-100) is calculated. Launches scoring >= 60 trigger an alert.

4. **Review**: The opportunity is displayed with full details:
   - Token name, symbol, and mint address
   - Creator information and verification status
   - Filter breakdown with individual scores
   - Suggested position size based on your portfolio

5. **Confirm or Skip**: Press Enter to execute the trade or Esc to skip.

6. **Position Tracking**: Confirmed trades are tracked with real-time P&L.

7. **Exit Management**: Positions are monitored against take-profit and stop-loss thresholds.

## Architecture

```
+-------------------------------------------------------------------+
|                         BAGS SNIPER BOT                            |
+-------------------------------------------------------------------+
|                                                                    |
|  +------------+    +------------+    +------------+               |
|  |  Restream  |--->|  Filter    |--->|  Scoring   |               |
|  |  Listener  |    |  Pipeline  |    |  Engine    |               |
|  +------------+    +------------+    +------------+               |
|                                            |                       |
|                                            v                       |
|  +------------+    +------------+    +------------+               |
|  |  Position  |<---|   Trade    |<---|   Alert    |               |
|  |  Manager   |    |  Executor  |    |   System   |               |
|  +------------+    +------------+    +------------+               |
|        |                                    |                      |
|        v                                    v                      |
|  +------------+                      +------------+               |
|  |   Exit     |--------------------->|  OpenTUI   |               |
|  |  Monitor   |                      |  Interface |               |
|  +------------+                      +------------+               |
|                                                                    |
+-------------------------------------------------------------------+
```

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
| Alert System | `src/alerts/system.ts` | Manages opportunity queue |
| Trade Executor | `src/trading/executor.ts` | Executes swap transactions |
| Wallet Manager | `src/trading/wallet.ts` | Handles wallet operations |
| Position Manager | `src/positions/manager.ts` | Tracks open positions |
| Exit Monitor | `src/exits/monitor.ts` | Monitors TP/SL conditions |
| OpenTUI App | `src/ui/app.ts` | Terminal user interface |

## Development

### Commands

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run tests once (no watch)
npm run test:run

# Type check
npm run typecheck

# Lint
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Build
npm run build
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
- **UI**: `@opentui/core` for terminal interface
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
