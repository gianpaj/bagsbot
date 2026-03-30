import { Keypair } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import type { SimulationDefinition } from './types.js';

function stablePublicKey(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 32);
  return Keypair.fromSeed(bytes).publicKey.toBase58();
}

export function createMixedOpportunitiesSimulationDefinition(): SimulationDefinition {
  const creatorAlpha = stablePublicKey('simulation:creator:alpha');
  const creatorBeta = stablePublicKey('simulation:creator:beta');
  const creatorGamma = stablePublicKey('simulation:creator:gamma');
  const creatorDelta = stablePublicKey('simulation:creator:delta');

  return {
    name: 'mixed-opportunities',
    description:
      'Interactive paper-trading profile with strong, borderline, weak-creator, and liquidity-trap launches.',
    launchIntervalMs: 2500,
    marketTickMs: 1000,
    loopLaunches: true,
    launches: [
      {
        id: 'alpha',
        label: 'Alpha Signal',
        kind: 'high-conviction',
        launch: {
          mint: stablePublicKey('simulation:mint:alpha'),
          creator: creatorAlpha,
          name: 'Alpha Signal',
          symbol: 'ALPHA',
          description: 'Strong creator, social, and liquidity profile.',
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
            { mint: stablePublicKey('simulation:alpha:prev1'), rugged: false },
          ],
        },
        social: {
          twitterMentioned: true,
          telegramActive: true,
          creatorEngagement: 82,
          communitySize: 1800,
        },
        liquidity: {
          initialLiquiditySol: 3.2,
          bondingCurvePercent: 24,
          topHolderPercent: 9,
          meteoraPoolExists: true,
        },
        market: {
          kind: 'generated',
          initialPrice: 0.0000024,
          driftPct: 4,
          volatilityPct: 8,
          pumpChance: 0.22,
          pumpMagnitudePct: 18,
          crashChance: 0.04,
          crashMagnitudePct: 14,
          minPrice: 0.0000012,
          maxPrice: 0.00003,
        },
      },
      {
        id: 'beta',
        label: 'Beta Edge',
        kind: 'borderline',
        launch: {
          mint: stablePublicKey('simulation:mint:beta'),
          creator: creatorBeta,
          name: 'Beta Edge',
          symbol: 'BETA',
          description: 'Barely clears the alert threshold.',
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
        market: {
          kind: 'generated',
          initialPrice: 0.0000018,
          driftPct: 1.2,
          volatilityPct: 6,
          pumpChance: 0.1,
          pumpMagnitudePct: 8,
          crashChance: 0.08,
          crashMagnitudePct: 9,
          minPrice: 0.000001,
          maxPrice: 0.000009,
        },
      },
      {
        id: 'gamma',
        label: 'Gamma Ghost',
        kind: 'weak-creator',
        launch: {
          mint: stablePublicKey('simulation:mint:gamma'),
          creator: creatorGamma,
          name: 'Gamma Ghost',
          symbol: 'GHOST',
          description: 'Looks polished but lacks creator trust.',
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
        market: {
          kind: 'generated',
          initialPrice: 0.0000015,
          driftPct: -1.8,
          volatilityPct: 9,
          pumpChance: 0.04,
          pumpMagnitudePct: 6,
          crashChance: 0.15,
          crashMagnitudePct: 16,
          minPrice: 0.0000003,
          maxPrice: 0.000004,
        },
      },
      {
        id: 'delta',
        label: 'Delta Drain',
        kind: 'liquidity-trap',
        launch: {
          mint: stablePublicKey('simulation:mint:delta'),
          creator: creatorDelta,
          name: 'Delta Drain',
          symbol: 'DRAIN',
          description: 'Attractive surface signals with bad liquidity metrics.',
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
          previousLaunches: [{ mint: stablePublicKey('simulation:delta:prev1'), rugged: false }],
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
        market: {
          kind: 'generated',
          initialPrice: 0.0000012,
          driftPct: -3.5,
          volatilityPct: 10,
          pumpChance: 0.02,
          pumpMagnitudePct: 4,
          crashChance: 0.18,
          crashMagnitudePct: 18,
          minPrice: 0.0000002,
          maxPrice: 0.000003,
        },
      },
    ],
  };
}
