# Bags Sniper Bot - Product Requirements Document

## Overview

A TypeScript-based CLI bot that monitors new token launches on the Bags platform (Solana) in real-time, filters opportunities using a multi-signal scoring system, and provides semi-automated trading with full position management.

### Goals

1. Detect new token launches instantly via Bags Restream API
2. Filter opportunities using creator, technical, social, and liquidity signals
3. Present opportunities in a rich terminal UI (OpenTUI) for manual confirmation
4. Execute trades via Bags SDK with portfolio-based position sizing
5. Monitor positions with take-profit (10x) and stop-loss (-50%) exit management

### Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **SDK**: `@bagsfm/bags-sdk` - Restream client, trading, state queries
- **UI**: `@opentui/core` - Terminal user interface
- **Blockchain**: `@solana/web3.js` - Wallet and transaction handling
- **Testing**: Vitest
- **Linting**: ESLint + Prettier

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BAGS SNIPER BOT                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Restream   │───▶│   Filter     │───▶│   Scoring    │      │
│  │   Listener   │    │   Pipeline   │    │   Engine     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                 │               │
│                                                 ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Position   │◀───│   Trade      │◀───│   Alert      │      │
│  │   Manager    │    │   Executor   │    │   System     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                                       │               │
│         ▼                                       ▼               │
│  ┌──────────────┐                       ┌──────────────┐       │
│  │   Exit       │                       │   OpenTUI    │       │
│  │   Monitor    │──────────────────────▶│   Interface  │       │
│  └──────────────┘                       └──────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. `RestreamClient` connects to Bags and subscribes to `LaunchpadLaunchEvent`
2. Each new launch passes through the **Filter Pipeline** (creator → technical → social → liquidity)
3. **Scoring Engine** calculates confidence score based on weighted filter results
4. Qualifying opportunities trigger **Alert System** to display in terminal UI
5. User reviews opportunity and confirms/rejects via interactive prompt
6. On confirmation, **Trade Executor** fetches quote and executes swap
7. **Position Manager** records the new position with entry price
8. **Exit Monitor** continuously checks positions against TP/SL thresholds

---

## Module Specifications

### 1. Restream Listener (`src/listeners/restream.ts`)

**Purpose**: Connect to Bags Restream service and emit new token launch events.

**Dependencies**:
- `RestreamClient` from `@bagsfm/bags-sdk`

**Interface**:
```typescript
interface RestreamListener {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onLaunch(handler: (event: LaunchpadLaunchEvent) => void): () => void;
  isConnected(): boolean;
}
```

**Behavior**:
- Auto-reconnect on connection loss with exponential backoff
- Emit connection status changes for UI display
- Buffer events during reconnection to prevent missed launches

**Events to handle**:
- `LaunchpadLaunchEvent` - Contains `mint`, creator info, metadata

---

### 2. Filter Pipeline (`src/filters/pipeline.ts`)

**Purpose**: Run launches through prioritized filter chain, collect results.

**Filter Priority Order**:
1. Creator Filters (weight: 40%)
2. Technical Filters (weight: 30%)
3. Social Filters (weight: 20%)
4. Liquidity Filters (weight: 10%)

**Interface**:
```typescript
interface FilterResult {
  passed: boolean;
  score: number;       // 0-100
  details: string;
}

interface FilterPipelineResult {
  launch: LaunchpadLaunchEvent;
  totalScore: number;
  passed: boolean;
  filters: {
    creator: FilterResult;
    technical: FilterResult;
    social: FilterResult;
    liquidity: FilterResult;
  };
  timestamp: Date;
}

interface FilterPipeline {
  evaluate(launch: LaunchpadLaunchEvent): Promise<FilterPipelineResult>;
  updateConfig(config: FilterConfig): void;
}
```

---

### 3. Filter Implementations (`src/filters/`)

#### 3.1 Creator Filter (`src/filters/creator.ts`)

**Checks**:
| Check | Points | Data Source |
|-------|--------|-------------|
| Has verified Twitter | 25 | `StateService.getLaunchWalletForTwitterUsername()` |
| Has verified TikTok | 15 | `StateService.getLaunchWalletV2()` |
| Previous successful launches (no rugs) | 30 | `StateService.getTokenCreators()` history lookup |
| Follower count > threshold | 20 | External API (Twitter/TikTok) |
| Account age > 30 days | 10 | External API |

**Interface**:
```typescript
interface CreatorFilterConfig {
  requireVerifiedSocial: boolean;
  minFollowerCount: number;
  minAccountAgeDays: number;
  checkPreviousLaunches: boolean;
}
```

#### 3.2 Technical Filter (`src/filters/technical.ts`)

**Checks**:
| Check | Points | Data Source |
|-------|--------|-------------|
| Metadata complete (name, symbol, image) | 30 | Token metadata |
| Description present and non-empty | 20 | Token metadata |
| Social links provided | 25 | Token metadata (telegram, twitter, website) |
| Valid image URL (not placeholder) | 15 | HTTP HEAD check |
| Standard token supply | 10 | Token account data |

**Interface**:
```typescript
interface TechnicalFilterConfig {
  requireCompleteMetadata: boolean;
  requireDescription: boolean;
  requireSocialLinks: boolean;
  validateImageUrl: boolean;
}
```

#### 3.3 Social Filter (`src/filters/social.ts`)

**Checks**:
| Check | Points | Data Source |
|-------|--------|-------------|
| Token mentioned on Twitter (pre-launch) | 40 | Twitter API search |
| Active Telegram group | 30 | Telegram API |
| Creator engagement (recent posts) | 20 | Social APIs |
| Community size indicators | 10 | Social APIs |

**Interface**:
```typescript
interface SocialFilterConfig {
  checkTwitterMentions: boolean;
  checkTelegramGroup: boolean;
  minCommunitySize: number;
}
```

**Note**: Social filters are optional and may require external API keys. Bot should gracefully handle when these are unavailable.

#### 3.4 Liquidity Filter (`src/filters/liquidity.ts`)

**Checks**:
| Check | Points | Data Source |
|-------|--------|-------------|
| Initial liquidity > minimum | 40 | Bonding curve state |
| Bonding curve < 50% filled | 25 | Bonding curve state |
| No whale concentration (top holder < 20%) | 25 | Token holder analysis |
| Pool exists on Meteora | 10 | DAMM V2 program query |

**Interface**:
```typescript
interface LiquidityFilterConfig {
  minInitialLiquiditySol: number;
  maxBondingCurvePercent: number;
  maxTopHolderPercent: number;
}
```

---

### 4. Scoring Engine (`src/scoring/engine.ts`)

**Purpose**: Calculate weighted total score and determine if opportunity qualifies.

**Interface**:
```typescript
interface ScoringConfig {
  weights: {
    creator: number;    // default: 0.40
    technical: number;  // default: 0.30
    social: number;     // default: 0.20
    liquidity: number;  // default: 0.10
  };
  minScoreToAlert: number;  // default: 60
  minScoreForHighConfidence: number; // default: 80
}

interface ScoringEngine {
  calculate(filters: FilterPipelineResult['filters']): number;
  meetsThreshold(score: number): boolean;
  getConfidenceLevel(score: number): 'low' | 'medium' | 'high';
}
```

**Calculation**:
```
totalScore = (creator.score * 0.40) + (technical.score * 0.30) +
             (social.score * 0.20) + (liquidity.score * 0.10)
```

---

### 5. Alert System (`src/alerts/system.ts`)

**Purpose**: Queue and display opportunities in the terminal UI.

**Interface**:
```typescript
interface Opportunity {
  id: string;
  launch: LaunchpadLaunchEvent;
  filterResult: FilterPipelineResult;
  suggestedAmount: number;  // Based on portfolio %
  preparedTx?: VersionedTransaction;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
}

interface AlertSystem {
  queue(opportunity: Opportunity): void;
  getCurrentOpportunity(): Opportunity | null;
  confirm(id: string, amount: number): Promise<void>;
  reject(id: string): void;
  getHistory(): Opportunity[];
}
```

**Behavior**:
- FIFO queue for opportunities
- Auto-expire opportunities after configurable timeout (default: 60s)
- Sound/visual notification for high-confidence opportunities

---

### 6. Trade Executor (`src/trading/executor.ts`)

**Purpose**: Prepare and execute swap transactions via Bags SDK.

**Dependencies**:
- `TradeService` from `@bagsfm/bags-sdk`
- Solana wallet (Keypair)

**Interface**:
```typescript
interface TradeConfig {
  slippageBps: number;        // default: 500 (5%)
  priorityFeeLamports: number; // default: 100000
  maxRetries: number;          // default: 3
}

interface TradeExecutor {
  prepareSwap(mint: PublicKey, amountSol: number): Promise<PreparedSwap>;
  executeSwap(prepared: PreparedSwap): Promise<TradeResult>;
  getQuote(mint: PublicKey, amountSol: number): Promise<TradeQuote>;
}

interface PreparedSwap {
  transaction: VersionedTransaction;
  quote: TradeQuote;
  expiresAt: Date;
}

interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  executedPrice?: number;
  tokensReceived?: number;
}
```

**Behavior**:
- Fetch quote first, display expected output to user
- Sign and send transaction with retry logic
- Confirm transaction with configurable commitment level

---

### 7. Position Manager (`src/positions/manager.ts`)

**Purpose**: Track open positions, calculate P&L, persist state.

**Interface**:
```typescript
interface Position {
  id: string;
  mint: PublicKey;
  tokenSymbol: string;
  entryPrice: number;        // SOL per token
  tokensHeld: number;
  entrySol: number;          // Total SOL spent
  entryTimestamp: Date;
  currentPrice?: number;
  currentValue?: number;
  pnlPercent?: number;
  status: 'open' | 'closed' | 'pending_exit';
}

interface PositionManager {
  addPosition(trade: TradeResult, launch: LaunchpadLaunchEvent): Position;
  updatePrices(): Promise<void>;
  getOpenPositions(): Position[];
  getPosition(id: string): Position | null;
  closePosition(id: string, result: TradeResult): void;
  getTotalValue(): number;
  getTotalPnL(): { absolute: number; percent: number };
}
```

**Persistence**:
- Store positions in local JSON file (`~/.bagsbot/positions.json`)
- Load on startup, save on every change

---

### 8. Exit Monitor (`src/exits/monitor.ts`)

**Purpose**: Continuously monitor positions against TP/SL thresholds.

**Interface**:
```typescript
interface ExitConfig {
  takeProfitPercent: number;   // default: 900 (10x = 900% gain)
  stopLossPercent: number;     // default: -50
  checkIntervalMs: number;     // default: 5000
  autoSellEnabled: boolean;    // default: false
}

interface ExitSignal {
  position: Position;
  type: 'take_profit' | 'stop_loss';
  currentPrice: number;
  triggerPercent: number;
}

interface ExitMonitor {
  start(): void;
  stop(): void;
  onExitSignal(handler: (signal: ExitSignal) => void): () => void;
  setAutoSell(enabled: boolean): void;
}
```

**Behavior**:
- Poll position prices at configured interval
- Emit exit signals when thresholds are crossed
- If auto-sell enabled, execute sell immediately
- If auto-sell disabled, alert user for confirmation

---

### 9. OpenTUI Interface (`src/ui/`)

**Purpose**: Rich terminal UI for displaying opportunities and managing the bot.

#### 9.1 Main Layout (`src/ui/layout.ts`)

```
┌─────────────────────────────────────────────────────────────────┐
│  BAGS SNIPER BOT v1.0.0                    Connected ● 0.5 SOL  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NEW OPPORTUNITY                                    Score: 85   │
│  ────────────────                                               │
│  Token: $EXAMPLE (ExAmPlE...mint)                               │
│  Creator: @verified_user (✓ Twitter, 50K followers)             │
│  Liquidity: 10.5 SOL | Curve: 12% filled                        │
│                                                                 │
│  Filters:                                                       │
│    ✓ Creator (92/100) - Verified, 3 past launches              │
│    ✓ Technical (85/100) - Complete metadata                     │
│    ○ Social (70/100) - Twitter mentions found                   │
│    ✓ Liquidity (80/100) - Good initial liquidity               │
│                                                                 │
│  Suggested: 0.05 SOL (2% of portfolio)                          │
│                                                                 │
│  [B] Buy  [S] Skip  [C] Custom amount  [V] View details         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  OPEN POSITIONS (3)                                             │
│  ────────────────                                               │
│  $TOKEN1  +125%  ▲  0.1 SOL → 0.225 SOL                        │
│  $TOKEN2   -15%  ▼  0.05 SOL → 0.042 SOL                       │
│  $TOKEN3   +45%  ▲  0.08 SOL → 0.116 SOL                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [P] Positions  [H] History  [S] Settings  [Q] Quit             │
└─────────────────────────────────────────────────────────────────┘
```

#### 9.2 Components

| Component | File | Purpose |
|-----------|------|---------|
| Header | `src/ui/components/header.ts` | Status bar with connection, wallet balance |
| OpportunityCard | `src/ui/components/opportunity-card.ts` | Display new opportunity details |
| FilterResults | `src/ui/components/filter-results.ts` | Show filter scores with icons |
| PositionList | `src/ui/components/position-list.ts` | Scrollable list of open positions |
| ActionBar | `src/ui/components/action-bar.ts` | Keybind hints |
| AmountInput | `src/ui/components/amount-input.ts` | Custom amount entry modal |
| ConfirmDialog | `src/ui/components/confirm-dialog.ts` | Confirmation prompts |

#### 9.3 Screens

| Screen | File | Purpose |
|--------|------|---------|
| Main | `src/ui/screens/main.ts` | Default view with opportunity + positions |
| Positions | `src/ui/screens/positions.ts` | Detailed position management |
| History | `src/ui/screens/history.ts` | Past trades and P&L |
| Settings | `src/ui/screens/settings.ts` | Configure filters, thresholds |

---

### 10. Configuration (`src/config/`)

**Config File**: `~/.bagsbot/config.json`

```typescript
interface BotConfig {
  // API Keys
  bagsApiKey: string;
  solanaRpcUrl: string;

  // Wallet
  walletPath: string;  // Path to keypair JSON

  // Portfolio
  maxPositionPercent: number;  // default: 2 (2% per trade)
  maxOpenPositions: number;    // default: 10

  // Filters
  filters: {
    creator: CreatorFilterConfig;
    technical: TechnicalFilterConfig;
    social: SocialFilterConfig;
    liquidity: LiquidityFilterConfig;
  };

  // Scoring
  scoring: ScoringConfig;

  // Trading
  trading: TradeConfig;

  // Exits
  exits: ExitConfig;

  // UI
  ui: {
    opportunityTimeoutSec: number;  // default: 60
    soundEnabled: boolean;           // default: true
  };
}
```

**Environment Variables** (override config):
- `BAGS_API_KEY`
- `SOLANA_RPC_URL`
- `WALLET_PATH`

---

## Data Types (`src/types/`)

```typescript
// src/types/index.ts - Re-export all types

// src/types/launch.ts
export interface LaunchpadLaunchEvent {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  telegram?: string;
  twitter?: string;
  website?: string;
  // ... other fields from Bags SDK
}

// src/types/filters.ts
export interface FilterConfig { /* ... */ }
export interface FilterResult { /* ... */ }
export interface FilterPipelineResult { /* ... */ }

// src/types/trading.ts
export interface TradeQuote { /* ... */ }
export interface TradeResult { /* ... */ }
export interface PreparedSwap { /* ... */ }

// src/types/positions.ts
export interface Position { /* ... */ }
export interface ExitSignal { /* ... */ }

// src/types/config.ts
export interface BotConfig { /* ... */ }
```

---

## Error Handling

### Error Types (`src/errors/`)

```typescript
export class BagsBotError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BagsBotError';
  }
}

export class ConnectionError extends BagsBotError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
  }
}

export class TradeError extends BagsBotError {
  constructor(message: string, public txSignature?: string) {
    super(message, 'TRADE_ERROR');
  }
}

export class FilterError extends BagsBotError {
  constructor(message: string, public filterName: string) {
    super(message, 'FILTER_ERROR');
  }
}

export class ConfigError extends BagsBotError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
  }
}
```

### Error Handling Strategy

1. **Connection errors**: Auto-retry with exponential backoff, notify user
2. **Trade errors**: Display error, keep position in pending state for retry
3. **Filter errors**: Log warning, continue with partial score (don't block opportunity)
4. **Config errors**: Fail fast on startup with clear error message

---

## Testing Strategy

### Unit Tests (`src/**/*.test.ts`)

| Module | Test File | Coverage Target |
|--------|-----------|-----------------|
| Filter Pipeline | `src/filters/pipeline.test.ts` | 90% |
| Creator Filter | `src/filters/creator.test.ts` | 90% |
| Technical Filter | `src/filters/technical.test.ts` | 90% |
| Social Filter | `src/filters/social.test.ts` | 80% |
| Liquidity Filter | `src/filters/liquidity.test.ts` | 90% |
| Scoring Engine | `src/scoring/engine.test.ts` | 95% |
| Position Manager | `src/positions/manager.test.ts` | 90% |
| Exit Monitor | `src/exits/monitor.test.ts` | 90% |
| Config Loader | `src/config/loader.test.ts` | 85% |

### Integration Tests (`tests/integration/`)

| Test | File | Purpose |
|------|------|---------|
| Restream Connection | `tests/integration/restream.test.ts` | Verify connection to Bags Restream |
| Trade Flow | `tests/integration/trade-flow.test.ts` | End-to-end buy flow (devnet) |
| Position Tracking | `tests/integration/positions.test.ts` | Position persistence and P&L |

### Mocks (`tests/mocks/`)

```typescript
// tests/mocks/bags-sdk.ts
export const mockRestreamClient = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  subscribeBagsLaunches: vi.fn(),
};

export const mockTradeService = {
  getQuote: vi.fn(),
  createSwapTransaction: vi.fn(),
};

export const mockStateService = {
  getTokenCreators: vi.fn(),
  getLaunchWalletForTwitterUsername: vi.fn(),
};

// tests/mocks/launch-events.ts
export const mockLaunchEvent: LaunchpadLaunchEvent = {
  mint: 'ExAmPlE...',
  creator: 'CrEaToR...',
  name: 'Test Token',
  symbol: 'TEST',
  // ...
};
```

### Test Commands

```bash
# Run all tests
bun test

# Run with coverage
bun run test:coverage

# Run specific test file
bun test -- src/filters/creator.test.ts

# Run integration tests (requires API keys)
bun run test:integration
```

---

## Project Structure

```
bagsbot/
├── src/
│   ├── index.ts              # Entry point
│   ├── bot.ts                # Main bot orchestrator
│   ├── config/
│   │   ├── index.ts
│   │   ├── loader.ts         # Load and validate config
│   │   ├── defaults.ts       # Default configuration
│   │   └── schema.ts         # Config validation schema
│   ├── listeners/
│   │   ├── index.ts
│   │   └── restream.ts       # Restream listener
│   ├── filters/
│   │   ├── index.ts
│   │   ├── pipeline.ts       # Filter orchestration
│   │   ├── creator.ts
│   │   ├── technical.ts
│   │   ├── social.ts
│   │   └── liquidity.ts
│   ├── scoring/
│   │   ├── index.ts
│   │   └── engine.ts
│   ├── alerts/
│   │   ├── index.ts
│   │   └── system.ts
│   ├── trading/
│   │   ├── index.ts
│   │   ├── executor.ts
│   │   └── wallet.ts         # Wallet management
│   ├── positions/
│   │   ├── index.ts
│   │   ├── manager.ts
│   │   └── storage.ts        # Persistence layer
│   ├── exits/
│   │   ├── index.ts
│   │   └── monitor.ts
│   ├── ui/
│   │   ├── index.ts
│   │   ├── app.ts            # OpenTUI app setup
│   │   ├── layout.ts
│   │   ├── components/
│   │   │   ├── header.ts
│   │   │   ├── opportunity-card.ts
│   │   │   ├── filter-results.ts
│   │   │   ├── position-list.ts
│   │   │   ├── action-bar.ts
│   │   │   ├── amount-input.ts
│   │   │   └── confirm-dialog.ts
│   │   └── screens/
│   │       ├── main.ts
│   │       ├── positions.ts
│   │       ├── history.ts
│   │       └── settings.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── launch.ts
│   │   ├── filters.ts
│   │   ├── trading.ts
│   │   ├── positions.ts
│   │   └── config.ts
│   ├── errors/
│   │   └── index.ts
│   └── utils/
│       ├── index.ts
│       ├── logger.ts         # Structured logging
│       ├── retry.ts          # Retry utilities
│       └── formatting.ts     # Number/address formatting
├── tests/
│   ├── integration/
│   │   ├── restream.test.ts
│   │   ├── trade-flow.test.ts
│   │   └── positions.test.ts
│   └── mocks/
│       ├── bags-sdk.ts
│       └── launch-events.ts
├── docs/
│   └── plans/
│       └── 2025-01-27-bags-sniper-bot-design.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.js
├── .prettierrc
├── .env.example
└── README.md
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Project setup (TypeScript, ESLint, Prettier, Vitest)
- [ ] Configuration system with validation
- [ ] Error handling framework
- [ ] Logger utility
- [ ] Type definitions

### Phase 2: Restream & Filters
- [ ] Restream listener with auto-reconnect
- [ ] Filter pipeline architecture
- [ ] Creator filter implementation
- [ ] Technical filter implementation
- [ ] Social filter implementation (optional external APIs)
- [ ] Liquidity filter implementation
- [ ] Scoring engine

### Phase 3: Trading
- [ ] Wallet management
- [ ] Trade executor with Bags SDK
- [ ] Quote fetching and display
- [ ] Transaction signing and confirmation
- [ ] Retry logic

### Phase 4: Position Management
- [ ] Position manager
- [ ] Persistence layer (JSON file storage)
- [ ] P&L calculations
- [ ] Exit monitor with TP/SL thresholds

### Phase 5: Terminal UI
- [ ] OpenTUI app setup
- [ ] Main layout
- [ ] Header component
- [ ] Opportunity card component
- [ ] Position list component
- [ ] Action bar and keybindings
- [ ] Amount input modal
- [ ] Confirmation dialogs
- [ ] Screen navigation

### Phase 6: Polish & Testing
- [ ] Unit tests for all filters
- [ ] Unit tests for scoring engine
- [ ] Unit tests for position manager
- [ ] Integration tests (devnet)
- [ ] Error handling edge cases
- [ ] Documentation (README)

---

## Best Practices

### Code Style
- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer `const` over `let`, never use `var`
- Use async/await over raw Promises
- Explicit return types on all functions
- No `any` types - use `unknown` and type guards

### Security
- Never log private keys or sensitive data
- Validate all external input
- Use environment variables for secrets
- Implement rate limiting for external API calls

### Performance
- Debounce rapid UI updates
- Cache token metadata to reduce RPC calls
- Use connection pooling for HTTP clients
- Lazy load UI components

### Reliability
- Implement graceful shutdown (SIGINT, SIGTERM)
- Persist state before exit
- Auto-recover from transient failures
- Log all errors with context

### Maintainability
- Single responsibility per module
- Dependency injection for testability
- Clear separation of concerns
- Comprehensive JSDoc comments on public APIs

---

## Environment Setup

### Prerequisites
- Node.js 18+
- Zig (required for OpenTUI)
- Solana CLI (optional, for wallet management)

### Installation
```bash
# Clone repository
git clone <repo-url>
cd bagsbot

# Install dependencies
bun install

# Copy environment template
cp .env.example .env

# Edit .env with your keys
# BAGS_API_KEY=your_api_key
# SOLANA_RPC_URL=https://your-rpc-url
# WALLET_PATH=~/.config/solana/id.json

# Build
bun run build

# Run
bun start
```

### Development
```bash
# Run in development mode with hot reload
bun run dev

# Run tests
bun test

# Lint
bun run lint

# Format
bun run format
```

---

## Risk Considerations

1. **Financial Risk**: This bot trades real tokens with real money. Start with small amounts.
2. **Smart Contract Risk**: New tokens may have malicious code. Filters help but don't eliminate risk.
3. **API Reliability**: Bags Restream may have downtime. Handle gracefully.
4. **RPC Limits**: Solana RPCs have rate limits. Use a quality provider.
5. **Slippage**: Fast-moving markets may result in worse execution than quoted.

---

## Future Enhancements (Out of Scope for v1)

- Discord/Telegram notification channels
- Web dashboard alternative to CLI
- Multiple wallet support
- Backtesting with historical data
- Machine learning-based scoring
- Copy trading from successful wallets
