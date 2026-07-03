import type { ConnectionStatus } from '../listeners/restream.js';
import type { Opportunity } from '../alerts/system.js';
import type { FilterPipelineResult } from '../types/filters.js';
import type { LaunchpadLaunchEvent } from '../types/launch.js';
import type { Position, ExitSignal } from '../types/positions.js';
import type { TradeResult } from '../types/trading.js';
import type { ConfidenceLevel } from '../scoring/engine.js';
import type { MarketAssessment, MarketRating, SignalStatus } from '../sdk/jupiter-market.js';

export type DashboardAgentName =
  | 'Launch Listener'
  | 'Creator Analyst'
  | 'Technical Analyst'
  | 'Social Analyst'
  | 'Liquidity Analyst'
  | 'Scoring Agent'
  | 'Opportunity Manager'
  | 'Trader'
  | 'Position Monitor';

export type DashboardAgentStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'error'
  | 'skipped';

export type DashboardEventType = 'Tool' | 'Reasoning' | 'System';

export interface DashboardEvent {
  id: string;
  itemId: string | 'global';
  type: DashboardEventType;
  timestamp: Date;
  content: string;
}

export interface DashboardOpportunityState {
  id: string;
  status: Opportunity['status'];
  suggestedAmount: number;
  confirmedAmount?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface DashboardTrackedItem {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  stage: string;
  score?: number;
  confidence?: ConfidenceLevel;
  filterResult?: FilterPipelineResult;
  market?: MarketAssessment;
  opportunity?: DashboardOpportunityState;
  position?: Position;
  agentStatuses: Record<DashboardAgentName, DashboardAgentStatus>;
  notes: string[];
  errors: string[];
}

export interface DashboardState {
  startedAt: Date;
  connectionStatus: ConnectionStatus;
  walletBalanceSol?: number;
  trackedItems: DashboardTrackedItem[];
  selectedItemId: string | null;
  events: DashboardEvent[];
  toolCalls: number;
  // Free-text filter applied to the Progress pane. Matches a coin by name,
  // symbol, or mint (coin hash). Empty string means no filter is active.
  searchQuery: string;
}

export interface DashboardMetrics {
  trackedItems: number;
  activeOpportunities: number;
  openPositions: number;
  toolCalls: number;
  generatedReports: number;
}

export const DASHBOARD_AGENT_ORDER: DashboardAgentName[] = [
  'Launch Listener',
  'Creator Analyst',
  'Technical Analyst',
  'Social Analyst',
  'Liquidity Analyst',
  'Scoring Agent',
  'Opportunity Manager',
  'Trader',
  'Position Monitor',
];

const MAX_EVENTS = 120;
const MAX_NOTES = 12;
const MAX_ERRORS = 8;
// In live (paper-mainnet) mode the bot tracks every launch it sees, so the
// tracked-item list would otherwise grow without bound over a long run — both
// leaking memory and making each layout rebuild O(items). Cap it, evicting the
// least-recently-updated items that aren't actively held (no open position and
// no pending opportunity).
const MAX_TRACKED_ITEMS = 200;

// Each tracked item carries the same agent pipeline so the progress pane can
// render a stable execution shape across launches and opportunities.
function createAgentStatuses(): Record<DashboardAgentName, DashboardAgentStatus> {
  return {
    'Launch Listener': 'pending',
    'Creator Analyst': 'pending',
    'Technical Analyst': 'pending',
    'Social Analyst': 'pending',
    'Liquidity Analyst': 'pending',
    'Scoring Agent': 'pending',
    'Opportunity Manager': 'pending',
    Trader: 'pending',
    'Position Monitor': 'pending',
  };
}

function sortTrackedItems(state: DashboardState): void {
  state.trackedItems.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function ensureSelection(state: DashboardState): void {
  if (state.trackedItems.length === 0) {
    state.selectedItemId = null;
    return;
  }

  if (
    state.selectedItemId === null ||
    !state.trackedItems.some((item) => item.id === state.selectedItemId)
  ) {
    state.selectedItemId = state.trackedItems[0]?.id ?? null;
  }
}

function appendUnique(list: string[], value: string, maxSize: number): void {
  if (value.length === 0) {
    return;
  }

  if (list[list.length - 1] !== value) {
    list.push(value);
  }

  while (list.length > maxSize) {
    list.shift();
  }
}

function touchItem(item: DashboardTrackedItem): void {
  item.updatedAt = new Date();
}

function getOpportunityLabel(item: DashboardTrackedItem): string {
  if (item.opportunity === undefined) {
    return 'none';
  }

  return item.opportunity.status;
}

function createTrackedItem(event: LaunchpadLaunchEvent): DashboardTrackedItem {
  return {
    id: event.mint,
    mint: event.mint,
    symbol: event.symbol,
    name: event.name,
    createdAt: new Date(),
    updatedAt: new Date(),
    stage: 'launch detected',
    agentStatuses: createAgentStatuses(),
    notes: [],
    errors: [],
  };
}

// An item is safe to evict once it no longer represents live capital or a
// decision the user still needs to make: no open position and no pending
// opportunity. Such items are historical and only consume memory.
function isEvictableItem(item: DashboardTrackedItem): boolean {
  return item.position?.status !== 'open' && item.opportunity?.status !== 'pending';
}

// Bound the tracked-item list. Assumes `state.trackedItems` is already sorted
// newest-first (by updatedAt), so the oldest candidates sit at the tail. Walks
// from the tail evicting evictable items until back under the cap; actively held
// items are skipped and may keep the list slightly above the cap, which is fine.
function pruneTrackedItems(state: DashboardState): void {
  if (state.trackedItems.length <= MAX_TRACKED_ITEMS) {
    return;
  }

  for (
    let index = state.trackedItems.length - 1;
    index >= 0 && state.trackedItems.length > MAX_TRACKED_ITEMS;
    index--
  ) {
    const item = state.trackedItems[index];
    if (item !== undefined && isEvictableItem(item)) {
      state.trackedItems.splice(index, 1);
      if (state.selectedItemId === item.id) {
        state.selectedItemId = null;
      }
    }
  }

  ensureSelection(state);
}

function getOrCreateItem(
  state: DashboardState,
  id: string,
  launch?: LaunchpadLaunchEvent
): DashboardTrackedItem {
  const existing = state.trackedItems.find((item) => item.id === id);
  if (existing !== undefined) {
    return existing;
  }

  if (launch === undefined) {
    throw new Error(`Tracked item ${id} does not exist and no launch payload was provided`);
  }

  const item = createTrackedItem(launch);
  state.trackedItems.push(item);
  sortTrackedItems(state);
  pruneTrackedItems(state);
  ensureSelection(state);
  return item;
}

// All right-pane activity is derived from this unified event stream. "Tool"
// entries also feed footer metrics.
function pushEvent(
  state: DashboardState,
  itemId: string | 'global',
  type: DashboardEventType,
  content: string
): void {
  state.events.unshift({
    id: `${String(Date.now())}-${Math.random().toString(16).slice(2)}`,
    itemId,
    type,
    timestamp: new Date(),
    content,
  });

  if (type === 'Tool') {
    state.toolCalls += 1;
  }

  while (state.events.length > MAX_EVENTS) {
    state.events.pop();
  }
}

function setAgentStatus(
  item: DashboardTrackedItem,
  agent: DashboardAgentName,
  status: DashboardAgentStatus
): void {
  item.agentStatuses[agent] = status;
  touchItem(item);
}

export function createDashboardState(): DashboardState {
  return {
    startedAt: new Date(),
    connectionStatus: 'disconnected',
    trackedItems: [],
    selectedItemId: null,
    events: [],
    toolCalls: 0,
    searchQuery: '',
  };
}

// App state snapshots are exposed to tests and layout code, so clone dates and
// nested dashboard objects to avoid leaking mutable references.
export function cloneDashboardState(state: DashboardState): DashboardState {
  return {
    ...state,
    startedAt: new Date(state.startedAt),
    trackedItems: state.trackedItems.map((item) => {
      const clonedItem: DashboardTrackedItem = {
        ...item,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        agentStatuses: { ...item.agentStatuses },
        notes: [...item.notes],
        errors: [...item.errors],
      };

      if (item.filterResult !== undefined) {
        clonedItem.filterResult = {
          ...item.filterResult,
          timestamp: new Date(item.filterResult.timestamp),
        };
      }

      if (item.opportunity !== undefined) {
        clonedItem.opportunity = {
          id: item.opportunity.id,
          status: item.opportunity.status,
          suggestedAmount: item.opportunity.suggestedAmount,
          createdAt: new Date(item.opportunity.createdAt),
        };

        if (item.opportunity.confirmedAmount !== undefined) {
          clonedItem.opportunity.confirmedAmount = item.opportunity.confirmedAmount;
        }

        if (item.opportunity.expiresAt !== undefined) {
          clonedItem.opportunity.expiresAt = new Date(item.opportunity.expiresAt);
        }
      }

      if (item.position !== undefined) {
        clonedItem.position = {
          ...item.position,
          entryTimestamp: new Date(item.position.entryTimestamp),
        };
      }

      if (item.market !== undefined) {
        clonedItem.market = {
          ...item.market,
          signals: item.market.signals.map((signal) => ({ ...signal })),
        };
      }

      return clonedItem;
    }),
    events: state.events.map((event) => ({
      ...event,
      timestamp: new Date(event.timestamp),
    })),
  };
}

export function getTrackedItem(
  state: DashboardState,
  itemId: string | null
): DashboardTrackedItem | null {
  if (itemId === null) {
    return null;
  }

  return state.trackedItems.find((item) => item.id === itemId) ?? null;
}

export function getSelectedTrackedItem(state: DashboardState): DashboardTrackedItem | null {
  return getTrackedItem(state, state.selectedItemId);
}

export function setWalletBalance(state: DashboardState, walletBalanceSol: number): void {
  state.walletBalanceSol = walletBalanceSol;
}

export function updateConnectionState(
  state: DashboardState,
  connectionStatus: ConnectionStatus
): void {
  state.connectionStatus = connectionStatus;
  pushEvent(state, 'global', 'Tool', `Restream connection is now ${connectionStatus}`);
}

export function trackLaunch(state: DashboardState, launch: LaunchpadLaunchEvent): DashboardTrackedItem {
  const item = getOrCreateItem(state, launch.mint, launch);
  item.symbol = launch.symbol;
  item.name = launch.name;
  item.stage = 'launch detected';
  setAgentStatus(item, 'Launch Listener', 'completed');
  appendUnique(item.notes, 'Launch detected from Bags restream.', MAX_NOTES);
  pushEvent(state, item.id, 'Tool', `Launch detected for ${launch.symbol} (${launch.name})`);
  sortTrackedItems(state);
  // Auto-select the freshest launch, but never pull selection to a coin the
  // active search filter is hiding — that would be jarring while searching.
  if (itemMatchesSearch(item, state.searchQuery)) {
    state.selectedItemId = item.id;
  } else {
    ensureVisibleSelection(state);
  }
  return item;
}

// These helpers model the synthetic "agent" lifecycle that the dashboard shows
// for each tracked coin as it moves through analysis and trading.
export function startAgentWork(
  state: DashboardState,
  itemId: string,
  agent: DashboardAgentName,
  message: string
): void {
  const item = getOrCreateItem(state, itemId);
  setAgentStatus(item, agent, 'in_progress');
  item.stage = message;
  pushEvent(state, item.id, 'Reasoning', `${agent}: ${message}`);
  sortTrackedItems(state);
  ensureSelection(state);
}

export function completeAgentWork(
  state: DashboardState,
  itemId: string,
  agent: DashboardAgentName,
  message: string
): void {
  const item = getOrCreateItem(state, itemId);
  setAgentStatus(item, agent, 'completed');
  item.stage = message;
  appendUnique(item.notes, `${agent}: ${message}`, MAX_NOTES);
  pushEvent(state, item.id, 'Reasoning', `${agent}: ${message}`);
  sortTrackedItems(state);
  ensureSelection(state);
}

export function skipAgentWork(
  state: DashboardState,
  itemId: string,
  agent: DashboardAgentName,
  message: string
): void {
  const item = getOrCreateItem(state, itemId);
  setAgentStatus(item, agent, 'skipped');
  item.stage = message;
  appendUnique(item.notes, `${agent}: ${message}`, MAX_NOTES);
  pushEvent(state, item.id, 'System', `${agent}: ${message}`);
  sortTrackedItems(state);
  ensureSelection(state);
}

export function failAgentWork(
  state: DashboardState,
  itemId: string,
  agent: DashboardAgentName,
  error: string
): void {
  const item = getOrCreateItem(state, itemId);
  setAgentStatus(item, agent, 'error');
  item.stage = `error in ${agent.toLowerCase()}`;
  appendUnique(item.errors, `${agent}: ${error}`, MAX_ERRORS);
  pushEvent(state, item.id, 'System', `${agent} failed: ${error}`);
  sortTrackedItems(state);
  ensureSelection(state);
}

export function applyFilterResult(
  state: DashboardState,
  itemId: string,
  filterResult: FilterPipelineResult,
  confidence: ConfidenceLevel
): void {
  const item = getOrCreateItem(state, itemId, filterResult.launch);
  item.filterResult = filterResult;
  item.score = filterResult.totalScore;
  item.confidence = confidence;
  item.stage = filterResult.passed ? 'analysis completed' : 'screened out';

  const filterMap: [DashboardAgentName, keyof FilterPipelineResult['filters'], string][] = [
    ['Creator Analyst', 'creator', 'creator'],
    ['Technical Analyst', 'technical', 'technical'],
    ['Social Analyst', 'social', 'social'],
    ['Liquidity Analyst', 'liquidity', 'liquidity'],
  ];

  filterMap.forEach(([agent, key, label]) => {
    const result = filterResult.filters[key];
    const verb = result.passed ? 'completed' : 'completed with concerns';
    setAgentStatus(item, agent, 'completed');
    appendUnique(
      item.notes,
      `${agent}: ${label} score ${String(result.score)}/100. ${result.details}`,
      MAX_NOTES
    );
    pushEvent(
      state,
      item.id,
      'Reasoning',
      `${agent}: ${verb}. ${label} score ${String(result.score)}/100`
    );
  });

  setAgentStatus(item, 'Scoring Agent', 'completed');
  appendUnique(
    item.notes,
    `Scoring Agent: total score ${String(filterResult.totalScore)}/100 (${confidence}).`,
    MAX_NOTES
  );
  pushEvent(
    state,
    item.id,
    'Reasoning',
    `Scoring Agent: total score ${String(filterResult.totalScore)}/100 (${confidence})`
  );
  sortTrackedItems(state);
  ensureSelection(state);
}

/**
 * Attach a Jupiter market assessment to a tracked item and note its rating.
 */
export function setMarketData(
  state: DashboardState,
  itemId: string,
  market: MarketAssessment,
  meta?: { mint: string; symbol: string; name: string }
): void {
  const item = getOrCreateItem(
    state,
    itemId,
    meta !== undefined
      ? { mint: meta.mint, creator: 'unknown', name: meta.name, symbol: meta.symbol }
      : undefined
  );
  item.market = market;
  appendUnique(
    item.notes,
    `Market: ${market.rating.toUpperCase()} (${String(market.score)}/100) - ` +
      market.signals.map((signal) => `${signal.label} ${signal.value}`).join(', '),
    MAX_NOTES
  );
  pushEvent(state, item.id, 'System', `Market assessed: ${market.rating} (${String(market.score)}/100)`);
}

export function markOpportunityCreated(
  state: DashboardState,
  opportunity: Opportunity
): void {
  const item = getOrCreateItem(state, opportunity.launch.mint, opportunity.launch);
  const opportunityState: DashboardOpportunityState = {
    id: opportunity.id,
    status: opportunity.status,
    suggestedAmount: opportunity.suggestedAmount,
    createdAt: opportunity.timestamp,
  };
  if (opportunity.expiresAt !== undefined) {
    opportunityState.expiresAt = opportunity.expiresAt;
  }
  item.opportunity = opportunityState;
  item.stage = 'opportunity queued';
  setAgentStatus(item, 'Opportunity Manager', 'completed');
  appendUnique(
    item.notes,
    `Opportunity Manager: queued ${opportunity.suggestedAmount.toFixed(4)} SOL opportunity.`,
    MAX_NOTES
  );
  pushEvent(
    state,
    item.id,
    'Tool',
    `Opportunity queued at ${opportunity.suggestedAmount.toFixed(4)} SOL`
  );
  sortTrackedItems(state);
  ensureSelection(state);
}

// Opportunity and trade helpers translate the bot’s queue/execution lifecycle
// into the item-centric dashboard model.
export function syncOpportunityStatus(
  state: DashboardState,
  opportunity: Opportunity
): void {
  const item = getOrCreateItem(state, opportunity.launch.mint, opportunity.launch);
  const opportunityState: DashboardOpportunityState = {
    id: opportunity.id,
    status: opportunity.status,
    suggestedAmount: opportunity.suggestedAmount,
    createdAt: opportunity.timestamp,
  };
  if (opportunity.status === 'confirmed') {
    opportunityState.confirmedAmount = opportunity.suggestedAmount;
  } else if (item.opportunity?.confirmedAmount !== undefined) {
    opportunityState.confirmedAmount = item.opportunity.confirmedAmount;
  }
  if (opportunity.expiresAt !== undefined) {
    opportunityState.expiresAt = opportunity.expiresAt;
  }
  item.opportunity = opportunityState;

  if (opportunity.status === 'confirmed') {
    item.stage = 'opportunity confirmed';
    appendUnique(
      item.notes,
      `Opportunity Manager: confirmed at ${opportunity.suggestedAmount.toFixed(4)} SOL.`,
      MAX_NOTES
    );
    pushEvent(state, item.id, 'System', 'Opportunity confirmed');
  } else if (opportunity.status === 'rejected') {
    item.stage = 'opportunity rejected';
    appendUnique(item.notes, 'Opportunity Manager: rejected by user.', MAX_NOTES);
    pushEvent(state, item.id, 'System', 'Opportunity rejected');
    skipAgentWork(state, item.id, 'Trader', 'trade skipped after rejection');
    skipAgentWork(state, item.id, 'Position Monitor', 'no position to monitor');
    return;
  } else if (opportunity.status === 'expired') {
    item.stage = 'opportunity expired';
    appendUnique(item.notes, 'Opportunity Manager: opportunity expired.', MAX_NOTES);
    pushEvent(state, item.id, 'System', 'Opportunity expired');
    skipAgentWork(state, item.id, 'Trader', 'trade skipped after expiry');
    skipAgentWork(state, item.id, 'Position Monitor', 'no position to monitor');
    return;
  }

  sortTrackedItems(state);
  ensureSelection(state);
}

export function startTradeExecution(
  state: DashboardState,
  itemId: string,
  amountSol: number
): void {
  const item = getOrCreateItem(state, itemId);
  setAgentStatus(item, 'Trader', 'in_progress');
  item.stage = 'executing trade';
  pushEvent(state, item.id, 'Tool', `Trader: preparing swap for ${amountSol.toFixed(4)} SOL`);
  sortTrackedItems(state);
  ensureSelection(state);
}

export function completeTradeExecution(
  state: DashboardState,
  itemId: string,
  tradeResult: TradeResult
): void {
  const item = getOrCreateItem(state, itemId);
  setAgentStatus(item, 'Trader', 'completed');
  item.stage = 'trade completed';
  appendUnique(
    item.notes,
    `Trader: swap executed${
      tradeResult.signature !== undefined && tradeResult.signature !== ''
        ? ` (${tradeResult.signature})`
        : ''
    }.`,
    MAX_NOTES
  );
  pushEvent(
    state,
    item.id,
    'Tool',
    `Trader: trade executed${
      tradeResult.signature !== undefined && tradeResult.signature !== ''
        ? ` (${tradeResult.signature})`
        : ''
    }`
  );
  sortTrackedItems(state);
  ensureSelection(state);
}

export function failTradeExecution(
  state: DashboardState,
  itemId: string,
  error: string
): void {
  failAgentWork(state, itemId, 'Trader', error);
  skipAgentWork(state, itemId, 'Position Monitor', 'no position opened after trade failure');
}

export function syncPositions(state: DashboardState, positions: Position[]): void {
  const openMints = new Set(positions.map((position) => position.mint));

  positions.forEach((position) => {
    const item = getOrCreateItem(state, position.mint, {
      mint: position.mint,
      symbol: position.tokenSymbol,
      name: position.tokenSymbol,
      creator: 'unknown',
    });
    item.position = position;
    item.stage = 'position open';
    setAgentStatus(item, 'Position Monitor', 'completed');
    appendUnique(
      item.notes,
      `Position Monitor: ${position.tokenSymbol} position is ${position.status}.`,
      MAX_NOTES
    );
    pushEvent(state, item.id, 'System', `Position updated for ${position.tokenSymbol}`);
  });

  state.trackedItems.forEach((item) => {
    if (!openMints.has(item.mint) && item.position?.status === 'open') {
      item.position = {
        ...item.position,
        status: 'closed',
      };
      appendUnique(item.notes, 'Position Monitor: position closed.', MAX_NOTES);
    }
  });

  sortTrackedItems(state);
  ensureSelection(state);
}

export function recordExitSignal(state: DashboardState, signal: ExitSignal): void {
  const item = getOrCreateItem(state, signal.position.mint, {
    mint: signal.position.mint,
    symbol: signal.position.tokenSymbol,
    name: signal.position.tokenSymbol,
    creator: 'unknown',
  });
  setAgentStatus(item, 'Position Monitor', 'in_progress');
  item.stage = `${signal.type.replace('_', ' ')} triggered`;
  appendUnique(
    item.notes,
    `Position Monitor: ${signal.type.replace('_', ' ')} triggered at ${String(signal.currentPrice)}.`,
    MAX_NOTES
  );
  pushEvent(
    state,
    item.id,
    'System',
    `Exit signal: ${signal.type} at ${signal.currentPrice.toFixed(6)}`
  );
  sortTrackedItems(state);
  ensureSelection(state);
}

export function addSystemMessage(
  state: DashboardState,
  message: string,
  itemId: string | 'global' = 'global'
): void {
  pushEvent(state, itemId, 'System', message);
}

// Does a tracked coin match the free-text search query? Matching is
// case-insensitive substring over the coin's name, ticker symbol, and mint
// (the "coin hash") so users can find a coin by any of them.
export function itemMatchesSearch(item: DashboardTrackedItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }

  return (
    item.name.toLowerCase().includes(needle) ||
    item.symbol.toLowerCase().includes(needle) ||
    item.mint.toLowerCase().includes(needle)
  );
}

// The tracked coins the Progress pane should show given the active search
// query. With no query this is just every tracked item.
export function getVisibleTrackedItems(state: DashboardState): DashboardTrackedItem[] {
  if (state.searchQuery.trim() === '') {
    return state.trackedItems;
  }

  return state.trackedItems.filter((item) => itemMatchesSearch(item, state.searchQuery));
}

// Keep the selection pointing at a coin that is actually visible under the
// current filter. If the selected coin was filtered out, fall back to the first
// visible coin (or clear the selection when nothing matches).
function ensureVisibleSelection(state: DashboardState): void {
  const visible = getVisibleTrackedItems(state);
  if (visible.length === 0) {
    state.selectedItemId = null;
    return;
  }

  if (!visible.some((item) => item.id === state.selectedItemId)) {
    state.selectedItemId = visible[0]?.id ?? null;
  }
}

// Apply (or clear, with an empty string) the Progress-pane search filter and
// reconcile the selection with whatever is now visible.
export function setSearchQuery(state: DashboardState, query: string): void {
  state.searchQuery = query;
  ensureVisibleSelection(state);
}

// Selection is cyclic so the keyboard UX stays predictable in a live-updating
// list. Navigation walks the *visible* (filtered) coins so j/k stay inside the
// search results while a filter is active.
export function selectNextItem(state: DashboardState): void {
  const items = getVisibleTrackedItems(state);
  if (items.length === 0) {
    state.selectedItemId = null;
    return;
  }

  const currentIndex = items.findIndex((item) => item.id === state.selectedItemId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
  state.selectedItemId = items[nextIndex]?.id ?? null;
}

export function selectPreviousItem(state: DashboardState): void {
  const items = getVisibleTrackedItems(state);
  if (items.length === 0) {
    state.selectedItemId = null;
    return;
  }

  const currentIndex = items.findIndex((item) => item.id === state.selectedItemId);
  const previousIndex =
    currentIndex >= 0 ? (currentIndex - 1 + items.length) % items.length : 0;
  state.selectedItemId = items[previousIndex]?.id ?? null;
}

export function getSelectedPendingOpportunity(state: DashboardState): DashboardOpportunityState | null {
  const item = getSelectedTrackedItem(state);
  if (item?.opportunity?.status !== 'pending') {
    return null;
  }

  return item.opportunity;
}

export function getDashboardMetrics(state: DashboardState): DashboardMetrics {
  return {
    trackedItems: state.trackedItems.length,
    activeOpportunities: state.trackedItems.filter(
      (item) => item.opportunity?.status === 'pending'
    ).length,
    openPositions: state.trackedItems.filter((item) => item.position?.status === 'open').length,
    toolCalls: state.toolCalls,
    generatedReports: state.trackedItems.filter(
      (item) =>
        item.filterResult !== undefined ||
        item.opportunity !== undefined ||
        item.position !== undefined ||
        item.notes.length > 0 ||
        item.errors.length > 0
    ).length,
  };
}

/** Per-position profit/loss snapshot. */
export interface PositionPnl {
  /** Current value in SOL (falls back to entry cost before a price is known). */
  valueSol: number;
  /** Profit/loss in SOL versus entry cost. */
  pnlSol: number;
  /** Profit/loss as a percentage of entry cost. */
  pnlPercent: number;
}

/** Aggregate portfolio snapshot across all open positions. */
export interface PortfolioSummary {
  positions: Position[];
  openCount: number;
  totalEntrySol: number;
  totalCurrentValueSol: number;
  totalPnlSol: number;
  totalPnlPercent: number;
}

/** All currently open positions, in the order they are tracked. */
export function getOpenPositions(state: DashboardState): Position[] {
  return state.trackedItems
    .map((item) => item.position)
    .filter((position): position is Position => position?.status === 'open');
}

/**
 * Compute a position's value and profit/loss. Before the price poller has set a
 * current price, value falls back to the entry cost so PnL reads as flat rather
 * than as a total loss.
 */
export function getPositionPnl(position: Position): PositionPnl {
  const valueSol =
    position.currentValue ??
    (position.currentPrice !== undefined
      ? position.currentPrice * position.tokensHeld
      : position.entrySol);
  const pnlSol = valueSol - position.entrySol;
  const pnlPercent = position.entrySol > 0 ? (pnlSol / position.entrySol) * 100 : 0;
  return { valueSol, pnlSol, pnlPercent };
}

/** Aggregate open positions into a portfolio-level PnL summary. */
export function getPortfolioSummary(state: DashboardState): PortfolioSummary {
  const positions = getOpenPositions(state);
  let totalEntrySol = 0;
  let totalCurrentValueSol = 0;
  for (const position of positions) {
    totalEntrySol += position.entrySol;
    totalCurrentValueSol += getPositionPnl(position).valueSol;
  }
  const totalPnlSol = totalCurrentValueSol - totalEntrySol;
  const totalPnlPercent = totalEntrySol > 0 ? (totalPnlSol / totalEntrySol) * 100 : 0;
  return {
    positions,
    openCount: positions.length,
    totalEntrySol,
    totalCurrentValueSol,
    totalPnlSol,
    totalPnlPercent,
  };
}

export function formatTimestamp(timestamp: Date): string {
  return timestamp.toTimeString().slice(0, 8);
}

export function formatAgentStatus(status: DashboardAgentStatus): string {
  switch (status) {
    case 'in_progress':
      return 'in_progress';
    default:
      return status;
  }
}

/**
 * A single line of the analysis report. `color` is an optional OpenTUI
 * foreground token applied by the renderer; it is set for the market rating
 * headline and each market signal so the detail pane keeps the same coloring
 * the per-signal breakdown used to have.
 */
export interface ReportLine {
  content: string;
  color?: string;
}

function reportRatingColor(rating: MarketRating): string {
  switch (rating) {
    case 'good':
      return 'green';
    case 'caution':
      return 'yellow';
    default:
      return 'red';
  }
}

function reportSignalColor(status: SignalStatus): string {
  switch (status) {
    case 'good':
      return 'green';
    case 'warn':
      return 'yellow';
    case 'bad':
      return 'red';
    default:
      return 'gray';
  }
}

export function buildCurrentReportLines(item: DashboardTrackedItem | null): ReportLine[] {
  if (item === null) {
    return [{ content: 'Select a tracked coin to view analysis.' }];
  }

  // The report is assembled progressively from structured runtime data rather
  // than requiring a separate LLM output pipeline.
  const lines: ReportLine[] = [
    { content: `${item.name} (${item.symbol})` },
    { content: `Mint: ${item.mint}` },
    { content: `Stage: ${item.stage}` },
  ];

  if (item.score !== undefined) {
    lines.push({ content: `Score: ${String(item.score)}/100` });
  }

  if (item.confidence !== undefined) {
    lines.push({ content: `Confidence: ${item.confidence}` });
  }

  lines.push({ content: `Opportunity: ${getOpportunityLabel(item)}` });

  if (item.opportunity !== undefined) {
    lines.push({
      content: `Suggested amount: ${item.opportunity.suggestedAmount.toFixed(4)} SOL`,
    });
    if (item.opportunity.confirmedAmount !== undefined) {
      lines.push({
        content: `Confirmed amount: ${item.opportunity.confirmedAmount.toFixed(4)} SOL`,
      });
    }
  }

  if (item.filterResult !== undefined) {
    lines.push({ content: '' });
    lines.push({ content: 'Filter Breakdown' });
    lines.push({
      content: `Creator: ${String(item.filterResult.filters.creator.score)}/100 - ${item.filterResult.filters.creator.details}`,
    });
    lines.push({
      content: `Technical: ${String(item.filterResult.filters.technical.score)}/100 - ${item.filterResult.filters.technical.details}`,
    });
    lines.push({
      content: `Social: ${String(item.filterResult.filters.social.score)}/100 - ${item.filterResult.filters.social.details}`,
    });
    lines.push({
      content: `Liquidity: ${String(item.filterResult.filters.liquidity.score)}/100 - ${item.filterResult.filters.liquidity.details}`,
    });
  }

  if (item.market !== undefined) {
    lines.push({ content: '' });
    lines.push({
      content: `Market Signals - ${item.market.rating.toUpperCase()} (${String(item.market.score)}/100)`,
      color: reportRatingColor(item.market.rating),
    });
    item.market.signals.forEach((signal) => {
      const marker = signal.status === 'good' ? '+' : signal.status === 'bad' ? '!' : '~';
      lines.push({
        content: `${marker} ${signal.label}: ${signal.value}`,
        color: reportSignalColor(signal.status),
      });
    });
  }

  if (item.position !== undefined) {
    lines.push({ content: '' });
    lines.push({ content: 'Position' });
    lines.push({ content: `Status: ${item.position.status}` });
    lines.push({ content: `Entry: ${item.position.entrySol.toFixed(4)} SOL` });
    if (item.position.currentValue !== undefined) {
      lines.push({ content: `Current value: ${item.position.currentValue.toFixed(4)} SOL` });
    }
    if (item.position.pnlPercent !== undefined) {
      lines.push({ content: `PnL: ${item.position.pnlPercent.toFixed(2)}%` });
    }
  }

  if (item.notes.length > 0) {
    lines.push({ content: '' });
    lines.push({ content: 'Latest Analysis' });
    item.notes.slice(-8).forEach((note) => {
      lines.push({ content: `- ${note}` });
    });
  }

  if (item.errors.length > 0) {
    lines.push({ content: '' });
    lines.push({ content: 'Errors' });
    item.errors.slice(-4).forEach((error) => {
      lines.push({ content: `- ${error}` });
    });
  }

  return lines;
}

export function buildCurrentReport(item: DashboardTrackedItem | null): string {
  return buildCurrentReportLines(item)
    .map((line) => line.content)
    .join('\n');
}
