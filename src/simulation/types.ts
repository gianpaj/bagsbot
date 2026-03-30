import type { LiquidityData } from '../filters/index.js';
import type { LaunchpadLaunchEvent } from '../types/launch.js';

export interface SimulationCreatorProfile {
  twitterUsername?: string;
  twitterVerified?: boolean;
  followerCount?: number | null;
  accountAgeDays?: number | null;
  previousLaunches?: Array<{
    mint: string;
    rugged: boolean;
  }>;
}

export interface SimulationSocialProfile {
  twitterMentioned?: boolean | null;
  telegramActive?: boolean | null;
  creatorEngagement?: number | null;
  communitySize?: number | null;
}

export interface GeneratedMarketModel {
  kind: 'generated';
  initialPrice: number;
  driftPct: number;
  volatilityPct: number;
  pumpChance: number;
  pumpMagnitudePct: number;
  crashChance: number;
  crashMagnitudePct: number;
  minPrice: number;
  maxPrice: number;
}

export interface HistoryPricePoint {
  offsetMs: number;
  price: number;
}

export interface HistoryMarketModel {
  kind: 'history';
  initialPrice: number;
  timeline: HistoryPricePoint[];
}

export type SimulationMarketModel = GeneratedMarketModel | HistoryMarketModel;

export interface SimulationLaunchDefinition {
  id: string;
  label: string;
  kind: string;
  launch: LaunchpadLaunchEvent;
  creator: SimulationCreatorProfile;
  social: SimulationSocialProfile;
  liquidity: LiquidityData;
  market: SimulationMarketModel;
  launchDelayMs?: number;
}

export interface SimulationDefinition {
  name: string;
  description: string;
  launchIntervalMs: number;
  marketTickMs: number;
  loopLaunches: boolean;
  launches: SimulationLaunchDefinition[];
}
