import type { ConnectionStatus } from '../listeners/restream.js';
import type { Opportunity } from '../alerts/system.js';
import type { FilterPipelineResult } from '../types/filters.js';
import type { LaunchpadLaunchEvent } from '../types/launch.js';
import type { Position, ExitSignal } from '../types/positions.js';
import type { TradeResult } from '../types/trading.js';
import type { ConfidenceLevel } from '../scoring/engine.js';

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
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
  state.selectedItemId = item.id;
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

  const filterMap: Array<[DashboardAgentName, keyof FilterPipelineResult['filters'], string]> = [
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
      `${agent}: ${label} score ${result.score}/100. ${result.details}`,
      MAX_NOTES
    );
    pushEvent(
      state,
      item.id,
      'Reasoning',
      `${agent}: ${verb}. ${label} score ${result.score}/100`
    );
  });

  setAgentStatus(item, 'Scoring Agent', 'completed');
  appendUnique(
    item.notes,
    `Scoring Agent: total score ${filterResult.totalScore}/100 (${confidence}).`,
    MAX_NOTES
  );
  pushEvent(
    state,
    item.id,
    'Reasoning',
    `Scoring Agent: total score ${filterResult.totalScore}/100 (${confidence})`
  );
  sortTrackedItems(state);
  ensureSelection(state);
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
    `Trader: swap executed${tradeResult.signature ? ` (${tradeResult.signature})` : ''}.`,
    MAX_NOTES
  );
  pushEvent(
    state,
    item.id,
    'Tool',
    `Trader: trade executed${tradeResult.signature ? ` (${tradeResult.signature})` : ''}`
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
    if (!openMints.has(item.mint) && item.position !== undefined && item.position.status === 'open') {
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
    `Position Monitor: ${signal.type.replace('_', ' ')} triggered at ${signal.currentPrice}.`,
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

// Selection is cyclic so the keyboard UX stays predictable in a live-updating list.
export function selectNextItem(state: DashboardState): void {
  if (state.trackedItems.length === 0) {
    state.selectedItemId = null;
    return;
  }

  ensureSelection(state);
  const currentIndex = state.trackedItems.findIndex((item) => item.id === state.selectedItemId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % state.trackedItems.length : 0;
  state.selectedItemId = state.trackedItems[nextIndex]?.id ?? null;
}

export function selectPreviousItem(state: DashboardState): void {
  if (state.trackedItems.length === 0) {
    state.selectedItemId = null;
    return;
  }

  ensureSelection(state);
  const currentIndex = state.trackedItems.findIndex((item) => item.id === state.selectedItemId);
  const previousIndex =
    currentIndex >= 0
      ? (currentIndex - 1 + state.trackedItems.length) % state.trackedItems.length
      : 0;
  state.selectedItemId = state.trackedItems[previousIndex]?.id ?? null;
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

export function buildCurrentReport(item: DashboardTrackedItem | null): string {
  if (item === null) {
    return 'Select a tracked coin to view analysis.';
  }

  // The report is assembled progressively from structured runtime data rather
  // than requiring a separate LLM output pipeline.
  const lines = [
    `${item.name} (${item.symbol})`,
    `Mint: ${item.mint}`,
    `Stage: ${item.stage}`,
  ];

  if (item.score !== undefined) {
    lines.push(`Score: ${item.score}/100`);
  }

  if (item.confidence !== undefined) {
    lines.push(`Confidence: ${item.confidence}`);
  }

  lines.push(`Opportunity: ${getOpportunityLabel(item)}`);

  if (item.opportunity !== undefined) {
    lines.push(`Suggested amount: ${item.opportunity.suggestedAmount.toFixed(4)} SOL`);
    if (item.opportunity.confirmedAmount !== undefined) {
      lines.push(`Confirmed amount: ${item.opportunity.confirmedAmount.toFixed(4)} SOL`);
    }
  }

  if (item.filterResult !== undefined) {
    lines.push('');
    lines.push('Filter Breakdown');
    lines.push(
      `Creator: ${item.filterResult.filters.creator.score}/100 - ${item.filterResult.filters.creator.details}`
    );
    lines.push(
      `Technical: ${item.filterResult.filters.technical.score}/100 - ${item.filterResult.filters.technical.details}`
    );
    lines.push(
      `Social: ${item.filterResult.filters.social.score}/100 - ${item.filterResult.filters.social.details}`
    );
    lines.push(
      `Liquidity: ${item.filterResult.filters.liquidity.score}/100 - ${item.filterResult.filters.liquidity.details}`
    );
  }

  if (item.position !== undefined) {
    lines.push('');
    lines.push('Position');
    lines.push(`Status: ${item.position.status}`);
    lines.push(`Entry: ${item.position.entrySol.toFixed(4)} SOL`);
    if (item.position.currentValue !== undefined) {
      lines.push(`Current value: ${item.position.currentValue.toFixed(4)} SOL`);
    }
    if (item.position.pnlPercent !== undefined) {
      lines.push(`PnL: ${item.position.pnlPercent.toFixed(2)}%`);
    }
  }

  if (item.notes.length > 0) {
    lines.push('');
    lines.push('Latest Analysis');
    item.notes.slice(-8).forEach((note) => {
      lines.push(`- ${note}`);
    });
  }

  if (item.errors.length > 0) {
    lines.push('');
    lines.push('Errors');
    item.errors.slice(-4).forEach((error) => {
      lines.push(`- ${error}`);
    });
  }

  return lines.join('\n');
}
