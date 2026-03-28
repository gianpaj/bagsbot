# Dashboard UI Redesign

## Goal

Replace the current main bot terminal UI with a TradingAgents-style dashboard that has:

- a `Progress` pane for tracked coins and agent statuses
- a `Messages & Tools` pane for live execution events
- a `Current Report / New Analysis` pane for the currently selected coin
- a footer with global counters and uptime

The redesign should keep the UI agent-centric while reflecting launch and opportunity processing for real coins rather than abstract workflow placeholders.

## Current State

The existing UI in `src/ui` is screen-based and mostly placeholder-driven:

- `OpenTUIApp` stores `currentScreen`, `selectedOpportunity`, and `positions`
- `layout.ts` renders static `main`, `positions`, `history`, and `settings` screens
- `BagsBot` only pushes two UI updates: `showOpportunity()` and `updatePositions()`

The bot pipeline itself already contains the useful runtime boundaries:

- launch detection in `RestreamListener`
- filter execution in `FilterPipeline`
- score/confidence calculation in `ScoringEngine`
- opportunity queueing in `AlertSystem`
- trade execution in `TradeExecutor`
- live positions in `PositionManager` and `ExitMonitor`

## Product Model

The new dashboard is event-centric and item-centric, but still agent-oriented in how work is shown.

Each tracked coin or opportunity is represented by a dashboard item with:

- launch metadata
- lifecycle timestamps
- current opportunity state
- optional position state
- agent statuses for the pipeline
- a continuously updated analysis snapshot

The dashboard does not show a single transient card. It shows a rolling set of tracked items and lets the user move selection with the keyboard.

## Agent Model

The `Progress` pane remains agent-centric, but the agents represent bot subsystems:

- `Launch Listener`
- `Creator Analyst`
- `Technical Analyst`
- `Social Analyst`
- `Liquidity Analyst`
- `Scoring Agent`
- `Opportunity Manager`
- `Trader`
- `Position Monitor`

Each tracked item carries a status for each agent:

- `pending`
- `in_progress`
- `completed`
- `error`
- `skipped`

This preserves the feel of a multi-agent workflow while keeping the display grounded in the actual sniper bot pipeline.

## Event Stream

The UI is driven by structured dashboard events instead of direct widget mutations.

The initial event vocabulary:

- `launch_detected`
- `agent_started`
- `agent_completed`
- `agent_failed`
- `opportunity_created`
- `opportunity_confirmed`
- `opportunity_rejected`
- `opportunity_expired`
- `trade_started`
- `trade_completed`
- `trade_failed`
- `position_opened`
- `position_updated`
- `position_closed`
- `analysis_updated`
- `connection_status_changed`
- `system_message`

Each event includes:

- timestamp
- tracked item key or `global`
- display type such as `tool`, `reasoning`, or `system`
- short title
- optional payload preview

The right-hand pane is derived directly from this event stream.

## Derived UI State

The dashboard store derives the entire screen from the event stream and a tracked-items map.

Core derived state:

- ordered tracked items list
- selected tracked item id
- recent event log
- current report content for the selected item
- footer counters
- connection state
- wallet summary

Selection is keyboard-driven:

- `up` and `k` select the previous tracked item
- `down` and `j` select the next tracked item
- if the selected item disappears, selection falls back to the nearest surviving item

## UI Composition

The dashboard layout mirrors the TradingAgents composition:

1. Header
2. Split top row
3. Large report pane
4. Footer bar

### Header

Shows:

- bot name
- connection status
- wallet balance summary
- current selected symbol when available

### Progress Pane

Shows a compact list of tracked items. Each row group renders:

- coin symbol and name
- high-level status and score
- per-agent statuses in execution order

The selected tracked item is visually highlighted.

### Messages & Tools Pane

Shows reverse-chronological entries with:

- time
- type
- content preview

Entries come from both internal reasoning-style updates and external tool-like actions such as restream, filter execution, queue actions, and trade actions.

### Current Report Pane

Shows progressively synthesized text for the selected item:

- token metadata
- filter results
- aggregate score and confidence
- opportunity recommendation and state
- trade details if executed
- position monitoring notes
- error details when relevant

This pane updates incrementally as more of the pipeline completes.

### Footer

Shows counters and uptime:

- tracked items
- active opportunities
- open positions
- tool-style calls
- generated analyses
- elapsed runtime

## Architecture

### `dashboard-state.ts`

Introduce a dedicated store module under `src/ui` that owns:

- tracked item records
- event log
- selection
- footer metrics
- helper methods for applying typed events

This module should be pure where possible so it is easy to unit test.

### `app.ts`

Refactor `OpenTUIApp` to:

- remove screen navigation as the primary model
- hold a single dashboard state instance
- expose typed methods for publishing runtime events
- handle keyboard selection and buy/skip shortcuts for the selected item
- rebuild or refresh the layout from derived dashboard state

### `layout.ts`

Replace the existing screen-switching layout with a single dashboard layout function that renders:

- header
- `Progress`
- `Messages & Tools`
- `Current Report`
- footer

### `bot.ts`

Wire runtime boundaries to the dashboard event API so the UI receives live updates for:

- launch detection
- filter lifecycle
- scoring
- queueing
- confirmation/rejection
- trade execution
- position monitoring
- exit signals
- connection changes

## Error Handling

Errors should be represented in the dashboard state rather than only logs.

When an operation fails:

- the relevant agent status becomes `error`
- a visible event entry is appended
- the selected item report gets an error section

This applies to:

- connection changes
- filter errors
- queue/confirmation failures
- trade execution failures
- position update failures

## Testing Strategy

The previous UI tests mostly asserted placeholder screen creation. They should be replaced or supplemented with tests for:

- dashboard state transitions from typed events
- selection behavior
- report synthesis
- layout creation from dashboard state
- `OpenTUIApp` event publishing
- `BagsBot` integration points that update the UI

High-value cases:

- a passing launch becomes an opportunity
- a failing launch still appears in tracked history with skipped downstream agents
- a confirmed opportunity updates trader and position monitor states
- a trade failure surfaces as an error in progress, event log, and report

## Implementation Order

1. Add the design doc.
2. Introduce dashboard state types and reducers.
3. Replace the current `layout.ts` with a fixed dashboard layout.
4. Refactor `OpenTUIApp` around the dashboard store and keyboard selection.
5. Wire `BagsBot` to emit dashboard events through the full opportunity lifecycle.
6. Update tests for the new state model and interactions.

## Risks

- `@opentui/core` may be less ergonomic than Ink for complex table layouts and scrolling.
- The bot currently has limited asynchronous boundaries, so the first pass will synthesize some report sections from structured runtime data rather than true LLM-generated text.
- Existing screen-based tests will need broad replacement because the navigation model is being removed.

## Decision

Proceed with the OpenTUI-based redesign first because it preserves the current bot integration path in `src/bot.ts` while allowing the full TradingAgents-style dashboard structure and data model to be introduced behind a new UI state store.
