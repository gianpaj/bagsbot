/**
 * Opportunity Card Component
 *
 * Displays:
 * - Opportunity details: token name, symbol, mint address
 * - Creator info with verification status
 * - Liquidity and curve fill percentage
 * - Filter results with scores
 *
 * @module ui/components/opportunity-card
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
import * as OpenTUIRenderables from '@opentui/core';
import type { LaunchpadLaunchEvent } from '../../types/launch.js';
import type { FilterPipelineResult } from '../../types/filters.js';

// Extract Box and Text factory functions
const Box: any = (OpenTUIRenderables as any).Box;
const Text: any = (OpenTUIRenderables as any).Text;

/**
 * Configuration for the opportunity card component
 */
export interface OpportunityCardConfig {
  /** The launch event */
  launch: LaunchpadLaunchEvent;
  /** Filter results for this opportunity */
  filterResults?: FilterPipelineResult;
  /** Current liquidity in SOL */
  liquiditySol?: number;
  /** Bonding curve fill percentage (0-100) */
  curveFillPercent?: number;
  /** Creator verification status */
  creatorVerified?: boolean;
  /** Creator follower count */
  creatorFollowers?: number;
}

/**
 * Create the opportunity card component
 *
 * @param config - Opportunity card configuration
 * @returns Opportunity card component (VNode-like)
 */
export function createOpportunityCard(config: OpportunityCardConfig): unknown {
  const { launch, filterResults, liquiditySol = 0, curveFillPercent = 0 } = config;

  // Shorten mint address for display
  const shortMint =
    launch.mint.length > 20
      ? `${launch.mint.slice(0, 8)}...${launch.mint.slice(-8)}`
      : launch.mint;

  // Create verification indicator
  const creatorVerified = config.creatorVerified ?? false;
  const verificationBadge = creatorVerified ? '✓' : '○';
  const followersText =
    config.creatorFollowers !== undefined && config.creatorFollowers > 0
      ? ` (${(config.creatorFollowers / 1000).toFixed(0)}K followers)`
      : '';

  // Create score display
  const scoreText = filterResults ? `Score: ${filterResults.totalScore}` : 'Score: --';
  const scoreContent =
    filterResults && !filterResults.passed ? `${scoreText} (not passed)` : scoreText;

  const children: unknown[] = [
    Text({
      id: 'opportunity-title',
      content: 'NEW OPPORTUNITY',
    }),
    Text({
      id: 'opportunity-score',
      content: scoreContent,
    }),
    Text({
      id: 'opportunity-token',
      content: `Token: ${launch.name} (${launch.symbol}) | Mint: ${shortMint}`,
    }),
    Text({
      id: 'opportunity-creator',
      content: `Creator: ${verificationBadge} ${launch.creator.slice(0, 8)}...${launch.creator.slice(-8)}${followersText}`,
    }),
    Text({
      id: 'opportunity-liquidity',
      content: `Liquidity: ${liquiditySol.toFixed(2)} SOL | Curve: ${curveFillPercent.toFixed(1)}% filled`,
    }),
  ];

  // Add filter details if available
  if (filterResults) {
    children.push(
      Text({
        id: 'opportunity-filters',
        content: `Filters: Creator ${filterResults.filters.creator.score} | Technical ${filterResults.filters.technical.score} | Social ${filterResults.filters.social.score} | Liquidity ${filterResults.filters.liquidity.score}`,
      })
    );
  }

  return Box(
    {
      id: 'opportunity-card',
      flexDirection: 'column',
      width: '100%',
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    },
    ...children
  );
}
