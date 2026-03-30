import type { Position } from '../types/positions.js';
import type { PositionManager } from '../positions/manager.js';
import type { ExitMonitor } from '../exits/monitor.js';
import type {
  GeneratedMarketModel,
  HistoryMarketModel,
  SimulationDefinition,
  SimulationLaunchDefinition,
} from './types.js';
import { logger } from '../utils/logger.js';

const simulationLogger = logger.child({ module: 'simulation-engine' });

interface SimulationBindings {
  positionManager: PositionManager;
  exitMonitor: ExitMonitor;
  onPositionsUpdated?: (positions: Position[]) => void;
}

interface MarketState {
  launch: SimulationLaunchDefinition;
  currentPrice: number;
  activatedAt: number | null;
  active: boolean;
}

export interface SimulationEngine {
  start(bindings: SimulationBindings): void;
  stop(): void;
  activateLaunch(mint: string): void;
  getCurrentPrice(mint: string): number | null;
  getLaunch(mint: string): SimulationLaunchDefinition | null;
}

export class MarketSimulationEngine implements SimulationEngine {
  private readonly definition: SimulationDefinition;
  private readonly rng: () => number;
  private readonly marketStates = new Map<string, MarketState>();
  private bindings: SimulationBindings | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(definition: SimulationDefinition, rng: () => number = Math.random) {
    this.definition = definition;
    this.rng = rng;

    for (const launch of definition.launches) {
      this.marketStates.set(launch.launch.mint, {
        launch,
        currentPrice: launch.market.initialPrice,
        activatedAt: null,
        active: false,
      });
    }
  }

  start(bindings: SimulationBindings): void {
    this.bindings = bindings;
    if (this.tickTimer !== null) {
      return;
    }

    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.definition.marketTickMs);
    simulationLogger.info('Market simulation started', {
      marketTickMs: this.definition.marketTickMs,
      launchCount: this.definition.launches.length,
    });
  }

  stop(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.bindings = null;
    simulationLogger.info('Market simulation stopped');
  }

  activateLaunch(mint: string): void {
    const state = this.marketStates.get(mint);
    if (state === undefined || state.active) {
      return;
    }

    state.active = true;
    state.activatedAt = Date.now();
    state.currentPrice = state.launch.market.initialPrice;
    simulationLogger.info('Activated simulated market', {
      mint,
      initialPrice: state.currentPrice,
      kind: state.launch.kind,
    });
  }

  getCurrentPrice(mint: string): number | null {
    const state = this.marketStates.get(mint);
    if (state === undefined) {
      return null;
    }

    return state.currentPrice;
  }

  getLaunch(mint: string): SimulationLaunchDefinition | null {
    return this.marketStates.get(mint)?.launch ?? null;
  }

  private tick(): void {
    for (const state of this.marketStates.values()) {
      if (!state.active) {
        continue;
      }
      state.currentPrice = this.advancePrice(state);
    }

    if (this.bindings === null) {
      return;
    }

    const openPositions = this.bindings.positionManager.getOpenPositions();
    let positionsChanged = false;

    for (const position of openPositions) {
      const currentPrice = this.getCurrentPrice(position.mint);
      if (currentPrice === null) {
        continue;
      }

      this.bindings.positionManager.updatePositionPrice(position.id, currentPrice);
      const updatedPosition = this.bindings.positionManager.getPosition(position.id);
      if (updatedPosition !== null) {
        this.bindings.exitMonitor.updatePosition(updatedPosition);
        positionsChanged = true;
      }
    }

    if (positionsChanged) {
      this.bindings.onPositionsUpdated?.(this.bindings.positionManager.getOpenPositions());
    }
  }

  private advancePrice(state: MarketState): number {
    if (state.launch.market.kind === 'generated') {
      return this.advanceGeneratedPrice(state.currentPrice, state.launch.market);
    }

    return this.advanceHistoryPrice(state.launch.market, state.activatedAt);
  }

  private advanceGeneratedPrice(currentPrice: number, market: GeneratedMarketModel): number {
    const volatilityShock = (this.rng() - 0.5) * 2 * market.volatilityPct;
    let movePct = market.driftPct + volatilityShock;

    if (this.rng() < market.pumpChance) {
      movePct += market.pumpMagnitudePct * (0.5 + this.rng());
    }

    if (this.rng() < market.crashChance) {
      movePct -= market.crashMagnitudePct * (0.5 + this.rng());
    }

    const nextPrice = currentPrice * (1 + movePct / 100);
    return Math.min(Math.max(nextPrice, market.minPrice), market.maxPrice);
  }

  private advanceHistoryPrice(
    market: HistoryMarketModel,
    activatedAt: number | null
  ): number {
    if (activatedAt === null) {
      return market.initialPrice;
    }

    const elapsedMs = Date.now() - activatedAt;
    let price = market.initialPrice;

    for (const point of market.timeline) {
      if (point.offsetMs > elapsedMs) {
        break;
      }
      price = point.price;
    }

    return price;
  }
}
