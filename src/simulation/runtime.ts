import type {
  IExternalApiService,
  ILiquidityDataService,
  ILaunchHistoryService,
  ISocialApiService,
  IStateService,
  LiquidityData,
} from '../filters/index.js';
import type {
  IRestreamClient,
  RestreamEventMeta,
  RestreamLaunchpadLaunchSubscriptionHandler,
} from '../listeners/restream.js';
import type { FilterServiceOverrides } from '../sdk/filter-registry.js';
import type { IBagsTradeService } from '../trading/executor.js';
import type { SimulationDefinition, SimulationLaunchDefinition } from './types.js';
import { MarketSimulationEngine, type SimulationEngine } from './engine.js';
import { SimulationTradeService } from './trade-service.js';
import { logger } from '../utils/logger.js';

const simulationLogger = logger.child({ module: 'simulation-runtime' });

export interface SimulationRuntime {
  definition: SimulationDefinition;
  restreamClient: IRestreamClient;
  filterServiceOverrides: FilterServiceOverrides;
  tradeService: IBagsTradeService;
  simulationEngine: SimulationEngine;
}

class SimulationStateService implements IStateService {
  private usernameToCreator = new Map<string, string>();

  constructor(launches: SimulationLaunchDefinition[]) {
    for (const launch of launches) {
      const username = launch.creator.twitterUsername;
      if (username !== undefined && launch.creator.twitterVerified) {
        this.usernameToCreator.set(username, launch.launch.creator);
      }
    }
  }

  async getLaunchWalletForTwitterUsername(
    twitterUsername: string
  ): Promise<{ toString(): string }> {
    const creator = this.usernameToCreator.get(twitterUsername);
    if (creator === undefined) {
      throw new Error(`Twitter account ${twitterUsername} is not verified in this simulation`);
    }
    return { toString: (): string => creator };
  }

  async getLaunchWalletV2(): Promise<{ wallet: null; platformData: null }> {
    return { wallet: null, platformData: null };
  }

  async getTokenCreators(): Promise<
    {
      username: string;
      wallet: string;
      isCreator: boolean;
      provider: string | null;
    }[]
  > {
    return [];
  }
}

class SimulationExternalApiService implements IExternalApiService {
  private profiles = new Map<
    string,
    { followerCount: number | null; accountAgeDays: number | null }
  >();

  constructor(launches: SimulationLaunchDefinition[]) {
    for (const launch of launches) {
      const username = launch.creator.twitterUsername;
      if (username !== undefined) {
        this.profiles.set(username, {
          followerCount: launch.creator.followerCount ?? null,
          accountAgeDays: launch.creator.accountAgeDays ?? null,
        });
      }
    }
  }

  async getFollowerCount(
    _provider: 'twitter' | 'tiktok',
    username: string
  ): Promise<number | null> {
    return this.profiles.get(username)?.followerCount ?? null;
  }

  async getAccountAgeDays(
    _provider: 'twitter' | 'tiktok',
    username: string
  ): Promise<number | null> {
    return this.profiles.get(username)?.accountAgeDays ?? null;
  }
}

class SimulationLaunchHistoryService implements ILaunchHistoryService {
  private creatorLaunches = new Map<string, string[]>();
  private ruggedLaunches = new Map<string, boolean>();

  constructor(launches: SimulationLaunchDefinition[]) {
    for (const launch of launches) {
      const previousLaunches = launch.creator.previousLaunches ?? [];
      this.creatorLaunches.set(
        launch.launch.creator,
        previousLaunches.map((previous) => previous.mint)
      );
      for (const previous of previousLaunches) {
        this.ruggedLaunches.set(previous.mint, previous.rugged);
      }
    }
  }

  async getCreatorLaunches(creatorWallet: string): Promise<string[]> {
    return this.creatorLaunches.get(creatorWallet) ?? [];
  }

  async isTokenRugged(tokenMint: string): Promise<boolean> {
    return this.ruggedLaunches.get(tokenMint) ?? false;
  }
}

class SimulationSocialApiService implements ISocialApiService {
  private socialBySymbol = new Map<string, SimulationLaunchDefinition['social']>();
  private socialByCreator = new Map<string, SimulationLaunchDefinition['social']>();
  private socialByTelegram = new Map<string, SimulationLaunchDefinition['social']>();

  constructor(launches: SimulationLaunchDefinition[]) {
    for (const launch of launches) {
      this.socialBySymbol.set(launch.launch.symbol, launch.social);
      this.socialByCreator.set(launch.launch.creator, launch.social);
      if (launch.launch.telegram !== undefined) {
        this.socialByTelegram.set(launch.launch.telegram, launch.social);
      }
    }
  }

  async isTokenMentionedOnTwitter(tokenSymbol: string): Promise<boolean | null> {
    return this.socialBySymbol.get(tokenSymbol)?.twitterMentioned ?? null;
  }

  async isTelegramGroupActive(telegramUrl: string): Promise<boolean | null> {
    return this.socialByTelegram.get(telegramUrl)?.telegramActive ?? null;
  }

  async getCreatorEngagement(
    creatorWallet: string,
    _twitterUsername: string | null
  ): Promise<number | null> {
    return this.socialByCreator.get(creatorWallet)?.creatorEngagement ?? null;
  }

  async getCommunitySize(
    telegramUrl: string,
    _twitterUsername: string | null
  ): Promise<number | null> {
    return this.socialByTelegram.get(telegramUrl)?.communitySize ?? null;
  }
}

class SimulationLiquidityDataService implements ILiquidityDataService {
  private liquidityByMint = new Map<string, LiquidityData>();

  constructor(launches: SimulationLaunchDefinition[]) {
    for (const launch of launches) {
      this.liquidityByMint.set(launch.launch.mint, launch.liquidity);
    }
  }

  async getLiquidityData(mint: string): Promise<LiquidityData> {
    return this.liquidityByMint.get(mint) ?? {};
  }
}

class SimulationRestreamClient implements IRestreamClient {
  private readonly definition: SimulationDefinition;
  private readonly simulationEngine: SimulationEngine;
  private launchHandler: RestreamLaunchpadLaunchSubscriptionHandler | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private connected = false;

  constructor(definition: SimulationDefinition, simulationEngine: SimulationEngine) {
    this.definition = definition;
    this.simulationEngine = simulationEngine;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.scheduleLaunches();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
  }

  subscribeBagsLaunches(handler: RestreamLaunchpadLaunchSubscriptionHandler): () => void {
    this.launchHandler = handler;
    if (this.connected) {
      this.scheduleLaunches();
    }
    return (): void => {
      this.launchHandler = null;
    };
  }

  private scheduleLaunches(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];

    if (!this.connected || this.launchHandler === null) {
      return;
    }

    const cycleDuration =
      Math.max(
        ...this.definition.launches.map(
          (launch, index) => launch.launchDelayMs ?? index * this.definition.launchIntervalMs
        )
      ) + this.definition.launchIntervalMs;

    const scheduleCycle = (): void => {
      for (const [index, launch] of this.definition.launches.entries()) {
        const launchDelayMs = launch.launchDelayMs ?? index * this.definition.launchIntervalMs;
        const timer = setTimeout(() => {
          this.emitLaunch(launch);
        }, launchDelayMs);
        this.timers.push(timer);
      }

      if (this.definition.loopLaunches) {
        const loopTimer = setTimeout(() => {
          scheduleCycle();
        }, cycleDuration);
        this.timers.push(loopTimer);
      }
    };

    scheduleCycle();
  }

  private emitLaunch(launch: SimulationLaunchDefinition): void {
    if (!this.connected || this.launchHandler === null) {
      return;
    }

    this.simulationEngine.activateLaunch(launch.launch.mint);
    const meta: RestreamEventMeta = {
      channel: 'simulation',
      topic: this.definition.name,
      subject: launch.kind,
    };
    simulationLogger.info('Injecting simulated launch', {
      simulation: this.definition.name,
      label: launch.label,
      kind: launch.kind,
      mint: launch.launch.mint,
    });
    this.launchHandler(launch.launch, meta);
  }
}

export function createSimulationRuntime(definition: SimulationDefinition): SimulationRuntime {
  const launches = definition.launches;
  const simulationEngine = new MarketSimulationEngine(definition);

  return {
    definition,
    restreamClient: new SimulationRestreamClient(definition, simulationEngine),
    filterServiceOverrides: {
      stateService: new SimulationStateService(launches),
      externalApiService: new SimulationExternalApiService(launches),
      launchHistoryService: new SimulationLaunchHistoryService(launches),
      socialApiService: new SimulationSocialApiService(launches),
      liquidityDataService: new SimulationLiquidityDataService(launches),
    },
    tradeService: new SimulationTradeService(simulationEngine),
    simulationEngine,
  };
}
