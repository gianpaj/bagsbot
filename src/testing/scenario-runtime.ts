/**
 * Scenario launch runtime for local pipeline testing.
 *
 * Provides a synthetic launch source plus matching filter-service data so the
 * normal bot pipeline can be exercised without the live Bags restream.
 *
 * @module testing/scenario-runtime
 */

import { Keypair } from '@solana/web3.js';
import { createHash } from 'node:crypto';
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
import type { LaunchSourceConfig } from '../types/config.js';
import type { LaunchpadLaunchEvent } from '../types/launch.js';
import { logger } from '../utils/logger.js';

const scenarioLogger = logger.child({ module: 'scenario-runtime' });

function stablePublicKey(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 32);
  return Keypair.fromSeed(bytes).publicKey.toBase58();
}

interface ScenarioCreatorProfile {
  twitterUsername?: string;
  twitterVerified?: boolean;
  followerCount?: number | null;
  accountAgeDays?: number | null;
  previousLaunches?: Array<{
    mint: string;
    rugged: boolean;
  }>;
}

interface ScenarioSocialProfile {
  twitterMentioned?: boolean | null;
  telegramActive?: boolean | null;
  creatorEngagement?: number | null;
  communitySize?: number | null;
}

export interface ScenarioLaunch {
  id: string;
  label: string;
  kind: 'high-conviction' | 'borderline' | 'weak-creator' | 'liquidity-trap';
  launch: LaunchpadLaunchEvent;
  creator: ScenarioCreatorProfile;
  social: ScenarioSocialProfile;
  liquidity: LiquidityData;
}

export interface ScenarioDefinition {
  name: string;
  description: string;
  launches: ScenarioLaunch[];
}

export interface ScenarioLaunchSourceRuntime {
  scenario: ScenarioDefinition;
  restreamClient: IRestreamClient;
  filterServiceOverrides: FilterServiceOverrides;
}

function buildMixedOpportunitiesScenario(): ScenarioDefinition {
  const creatorAlpha = stablePublicKey('scenario:creator:alpha');
  const creatorBeta = stablePublicKey('scenario:creator:beta');
  const creatorGamma = stablePublicKey('scenario:creator:gamma');
  const creatorDelta = stablePublicKey('scenario:creator:delta');

  return {
    name: 'mixed-opportunities',
    description:
      'Cycles through strong, borderline, weak-creator, and liquidity-trap launches.',
    launches: [
      {
        id: 'alpha',
        label: 'Alpha Signal',
        kind: 'high-conviction',
        launch: {
          mint: stablePublicKey('scenario:mint:alpha'),
          creator: creatorAlpha,
          name: 'Alpha Signal',
          symbol: 'ALPHA',
          description: 'Scenario launch with strong creator, social, and liquidity data.',
          image: 'https://example.com/alpha.png',
          telegram: 'https://t.me/alpha_signal',
          twitter: 'https://x.com/alpha_signal',
          website: 'https://alpha.example.com',
        },
        creator: {
          twitterUsername: 'alpha_signal',
          twitterVerified: true,
          followerCount: 2400,
          accountAgeDays: 420,
          previousLaunches: [
            { mint: stablePublicKey('scenario:creator:alpha:prev1'), rugged: false },
            { mint: stablePublicKey('scenario:creator:alpha:prev2'), rugged: false },
          ],
        },
        social: {
          twitterMentioned: true,
          telegramActive: true,
          creatorEngagement: 78,
          communitySize: 1800,
        },
        liquidity: {
          initialLiquiditySol: 3.2,
          bondingCurvePercent: 24,
          topHolderPercent: 9,
          meteoraPoolExists: true,
        },
      },
      {
        id: 'beta',
        label: 'Beta Edge',
        kind: 'borderline',
        launch: {
          mint: stablePublicKey('scenario:mint:beta'),
          creator: creatorBeta,
          name: 'Beta Edge',
          symbol: 'BETA',
          description: 'Scenario launch intended to barely clear the alert threshold.',
          image: 'https://example.com/beta.png',
          telegram: 'https://t.me/beta_edge',
          twitter: 'https://x.com/beta_edge',
          website: 'https://beta.example.com',
        },
        creator: {
          twitterUsername: 'beta_edge',
          twitterVerified: true,
          followerCount: 95,
          accountAgeDays: 5,
          previousLaunches: [],
        },
        social: {
          twitterMentioned: true,
          telegramActive: false,
          creatorEngagement: 45,
          communitySize: 30,
        },
        liquidity: {
          initialLiquiditySol: 0.8,
          bondingCurvePercent: 54,
          topHolderPercent: 36,
          meteoraPoolExists: false,
        },
      },
      {
        id: 'gamma',
        label: 'Gamma Ghost',
        kind: 'weak-creator',
        launch: {
          mint: stablePublicKey('scenario:mint:gamma'),
          creator: creatorGamma,
          name: 'Gamma Ghost',
          symbol: 'GHOST',
          description: 'Looks polished but lacks a trustworthy creator signal.',
          image: 'https://example.com/gamma.png',
          telegram: 'https://t.me/gamma_ghost',
          twitter: 'https://x.com/gamma_ghost',
          website: 'https://ghost.example.com',
        },
        creator: {
          twitterUsername: 'gamma_ghost',
          twitterVerified: false,
          followerCount: 40,
          accountAgeDays: 2,
          previousLaunches: [],
        },
        social: {
          twitterMentioned: false,
          telegramActive: false,
          creatorEngagement: 10,
          communitySize: 20,
        },
        liquidity: {
          initialLiquiditySol: 2.1,
          bondingCurvePercent: 28,
          topHolderPercent: 12,
          meteoraPoolExists: true,
        },
      },
      {
        id: 'delta',
        label: 'Delta Drain',
        kind: 'liquidity-trap',
        launch: {
          mint: stablePublicKey('scenario:mint:delta'),
          creator: creatorDelta,
          name: 'Delta Drain',
          symbol: 'DRAIN',
          description: 'Strong social packaging with liquidity metrics that should disqualify it.',
          image: 'https://example.com/delta.png',
          telegram: 'https://t.me/delta_drain',
          twitter: 'https://x.com/delta_drain',
          website: 'https://drain.example.com',
        },
        creator: {
          twitterUsername: 'delta_drain',
          twitterVerified: true,
          followerCount: 1400,
          accountAgeDays: 300,
          previousLaunches: [{ mint: stablePublicKey('scenario:creator:delta:prev1'), rugged: false }],
        },
        social: {
          twitterMentioned: true,
          telegramActive: true,
          creatorEngagement: 73,
          communitySize: 950,
        },
        liquidity: {
          initialLiquiditySol: 0.15,
          bondingCurvePercent: 93,
          topHolderPercent: 65,
          meteoraPoolExists: false,
        },
      },
    ],
  };
}

const SCENARIOS: Record<string, ScenarioDefinition> = {
  'mixed-opportunities': buildMixedOpportunitiesScenario(),
};

export function getScenarioDefinition(name: string): ScenarioDefinition {
  const scenario = SCENARIOS[name];
  if (scenario === undefined) {
    const available = Object.keys(SCENARIOS).join(', ');
    throw new Error(`Unknown scenario "${name}". Available scenarios: ${available}`);
  }
  return scenario;
}

export function listScenarioNames(): string[] {
  return Object.keys(SCENARIOS);
}

class ScenarioStateService implements IStateService {
  private usernameToCreator = new Map<string, string>();

  constructor(launches: ScenarioLaunch[]) {
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
      throw new Error(`Twitter account ${twitterUsername} is not verified in this scenario`);
    }
    return {
      toString: (): string => creator,
    };
  }

  async getLaunchWalletV2(): Promise<{
    wallet: null;
    platformData: null;
  }> {
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

class ScenarioExternalApiService implements IExternalApiService {
  private profiles = new Map<
    string,
    { followerCount: number | null; accountAgeDays: number | null }
  >();

  constructor(launches: ScenarioLaunch[]) {
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

class ScenarioLaunchHistoryService implements ILaunchHistoryService {
  private creatorLaunches = new Map<string, string[]>();
  private ruggedLaunches = new Map<string, boolean>();

  constructor(launches: ScenarioLaunch[]) {
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

class ScenarioSocialApiService implements ISocialApiService {
  private socialBySymbol = new Map<string, ScenarioSocialProfile>();
  private socialByCreator = new Map<string, ScenarioSocialProfile>();
  private socialByTelegram = new Map<string, ScenarioSocialProfile>();

  constructor(launches: ScenarioLaunch[]) {
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

class ScenarioLiquidityDataService implements ILiquidityDataService {
  private liquidityByMint = new Map<string, LiquidityData>();

  constructor(launches: ScenarioLaunch[]) {
    for (const launch of launches) {
      this.liquidityByMint.set(launch.launch.mint, launch.liquidity);
    }
  }

  async getLiquidityData(mint: string): Promise<LiquidityData> {
    return this.liquidityByMint.get(mint) ?? {};
  }
}

export class ScenarioRestreamClient implements IRestreamClient {
  private readonly scenario: ScenarioDefinition;
  private readonly intervalMs: number;
  private launchHandler: RestreamLaunchpadLaunchSubscriptionHandler | null = null;
  private connected = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private launchIndex = 0;

  constructor(scenario: ScenarioDefinition, intervalMs: number) {
    this.scenario = scenario;
    this.intervalMs = intervalMs;
  }

  async connect(): Promise<void> {
    this.connected = true;
    scenarioLogger.info('Scenario launch source connected', {
      scenario: this.scenario.name,
      intervalMs: this.intervalMs,
      launchCount: this.scenario.launches.length,
    });
    this.ensureEmitter();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    scenarioLogger.info('Scenario launch source disconnected', {
      scenario: this.scenario.name,
    });
  }

  subscribeBagsLaunches(handler: RestreamLaunchpadLaunchSubscriptionHandler): () => void {
    this.launchHandler = handler;
    this.ensureEmitter();
    return (): void => {
      this.launchHandler = null;
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    };
  }

  private ensureEmitter(): void {
    if (!this.connected || this.launchHandler === null || this.timer !== null) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.emitNextLaunch();
    }, 0);
  }

  private emitNextLaunch(): void {
    if (!this.connected || this.launchHandler === null) {
      return;
    }

    const launch = this.scenario.launches[this.launchIndex];
    if (launch === undefined) {
      return;
    }

    const meta: RestreamEventMeta = {
      channel: 'scenario',
      topic: this.scenario.name,
      subject: launch.kind,
    };

    scenarioLogger.info('Injecting scenario launch', {
      scenario: this.scenario.name,
      label: launch.label,
      kind: launch.kind,
      mint: launch.launch.mint,
    });
    this.launchHandler(launch.launch, meta);

    this.launchIndex = (this.launchIndex + 1) % this.scenario.launches.length;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emitNextLaunch();
    }, this.intervalMs);
  }
}

export function createScenarioLaunchSourceRuntime(
  launchSourceConfig: LaunchSourceConfig
): ScenarioLaunchSourceRuntime {
  const scenario = getScenarioDefinition(launchSourceConfig.scenarioName);
  const launches = scenario.launches;

  return {
    scenario,
    restreamClient: new ScenarioRestreamClient(
      scenario,
      launchSourceConfig.scenarioIntervalMs
    ),
    filterServiceOverrides: {
      stateService: new ScenarioStateService(launches),
      externalApiService: new ScenarioExternalApiService(launches),
      launchHistoryService: new ScenarioLaunchHistoryService(launches),
      socialApiService: new ScenarioSocialApiService(launches),
      liquidityDataService: new ScenarioLiquidityDataService(launches),
    },
  };
}
