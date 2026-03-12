/**
 * Top Tokens CLI
 *
 * A simple CLI tool that displays the top tokens by lifetime fees
 * using the Bags SDK `getTopTokensByLifetimeFees` function and ink for rendering.
 *
 * Usage:
 *   bun --env-file=.env src/cli/top-tokens.tsx
 *
 * Requires BAGS_API_KEY and SOLANA_RPC_URL environment variables.
 *
 * @module cli/top-tokens
 */

import type { BagsTokenLeaderBoardItem } from '@bagsfm/bags-sdk';
import { BagsSDK } from '@bagsfm/bags-sdk';
import { Connection } from '@solana/web3.js';
import { Box, render, Text, useApp, useInput } from 'ink';
import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSOL(lamportsStr: string): string {
  const lamports = Number(lamportsStr);
  if (Number.isNaN(lamports)) return '—';
  const sol = lamports / 1e9;
  if (sol >= 1_000) return `${(sol / 1_000).toFixed(1)}K`;
  return sol.toFixed(2);
}

function formatUSD(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}

function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isUpdatedWithin7Days(item: BagsTokenLeaderBoardItem): boolean {
  const updatedAt = item.tokenInfo?.updatedAt;
  if (updatedAt == null || updatedAt.length === 0) return false;
  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) return false;
  return Date.now() - updatedDate.getTime() <= SEVEN_DAYS_MS;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Spinner({ label }: { label: string }): React.JSX.Element {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % frames.length);
    }, 80);
    return (): void => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Text>
      <Text color="cyan">{frames[index]} </Text>
      <Text>{label}</Text>
    </Text>
  );
}

function Header({ filterActive }: { filterActive: boolean }): React.JSX.Element {
  const filterLabel = filterActive ? '  [7d filter: ON]' : '';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        ╔══════════════════════════════════════════════════════════════════════════════════════╗
      </Text>
      <Text bold color="cyan">
        ║{'  '}
        <Text color="yellow">👜 BAGS</Text>
        {'  '}Top Tokens by Lifetime Fees
        {filterActive ? <Text color="green">{filterLabel}</Text> : <Text>{filterLabel}</Text>}
        {'                                           '}║
      </Text>
      <Text bold color="cyan">
        ╚══════════════════════════════════════════════════════════════════════════════════════╝
      </Text>
    </Box>
  );
}

interface TableHeaderProps {
  widths: readonly number[];
}

function TableHeader({ widths }: TableHeaderProps): React.JSX.Element {
  return (
    <Box>
      <Box width={widths[0]}>
        <Text bold color="gray">
          #
        </Text>
      </Box>
      <Box width={widths[1]}>
        <Text bold color="gray">
          Symbol
        </Text>
      </Box>
      <Box width={widths[2]}>
        <Text bold color="gray">
          Name
        </Text>
      </Box>
      <Box width={widths[3]}>
        <Text bold color="gray">
          Lifetime Fees
        </Text>
      </Box>
      <Box width={widths[4]}>
        <Text bold color="gray">
          FDV
        </Text>
      </Box>
      <Box width={widths[5]}>
        <Text bold color="gray">
          Price (USD)
        </Text>
      </Box>
      <Box width={widths[6]}>
        <Text bold color="gray">
          Holders
        </Text>
      </Box>
      <Box width={widths[7]}>
        <Text bold color="gray">
          Mint
        </Text>
      </Box>
    </Box>
  );
}

interface TokenRowProps {
  index: number;
  item: BagsTokenLeaderBoardItem;
  widths: readonly number[];
  isSelected: boolean;
}

function TokenRow({ index, item, widths, isSelected }: TokenRowProps): React.JSX.Element {
  const info = item.tokenInfo;
  const symbol = info?.symbol ?? '???';
  const name = info?.name ?? 'Unknown';
  const fdv = info?.fdv;
  const price = item.tokenLatestPrice?.priceUSD ?? info?.usdPrice;
  const holders = info?.holderCount;
  const mint = item.token;

  const rankColor = index < 3 ? 'yellow' : 'white';
  const symbolWidth = widths[1] ?? 10;
  const nameWidth = widths[2] ?? 18;

  return (
    <Box>
      <Box width={widths[0]}>
        <Text color={rankColor} bold={index < 3}>
          {isSelected ? '▸' : ' '}
          {String(index + 1).padStart(2)}
        </Text>
      </Box>
      <Box width={widths[1]}>
        <Text color="green" bold>
          {truncate(symbol, symbolWidth - 1)}
        </Text>
      </Box>
      <Box width={widths[2]}>
        <Text>{truncate(name, nameWidth - 1)}</Text>
      </Box>
      <Box width={widths[3]}>
        <Text color="yellowBright" bold>
          {formatSOL(item.lifetimeFees)} SOL
        </Text>
      </Box>
      <Box width={widths[4]}>
        <Text color="cyan">{formatUSD(fdv)}</Text>
      </Box>
      <Box width={widths[5]}>
        <Text>{price != null ? `$${price.toFixed(6)}` : '—'}</Text>
      </Box>
      <Box width={widths[6]}>
        <Text>{holders != null ? holders.toLocaleString() : '—'}</Text>
      </Box>
      <Box width={widths[7]}>
        <Text color="gray">{truncateAddress(mint)}</Text>
      </Box>
    </Box>
  );
}

interface CreatorsSectionProps {
  item: BagsTokenLeaderBoardItem;
}

function CreatorsSection({ item }: CreatorsSectionProps): React.JSX.Element | null {
  const creators = item.creators;
  if (creators == null || creators.length === 0) return null;

  const tokenLabel = item.tokenInfo?.symbol;

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2} marginBottom={1}>
      <Text bold color="magenta">
        Creators for {tokenLabel != null && tokenLabel.length > 0 ? tokenLabel : item.token}:
      </Text>
      {creators.slice(0, 5).map((c, i) => (
        <Box key={`${c.username}-${String(i)}`} marginLeft={1}>
          <Text>
            <Text color="gray">•</Text> <Text bold>{c.username}</Text>
            {c.providerUsername != null && c.providerUsername.length > 0 ? (
              <Text color="blue"> @{c.providerUsername}</Text>
            ) : null}
            {c.isCreator ? <Text color="yellow"> ★</Text> : null}
            <Text color="gray"> ({(c.royaltyBps / 100).toFixed(1)}% royalty)</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function Footer({ filterActive }: { filterActive: boolean }): React.JSX.Element {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">
        ↑/↓ Navigate{'  '}Enter: Show creators{'  '}f: {filterActive ? 'Show all' : 'Last 7 days'}
        {'  '}r: Refresh{'  '}q: Quit
      </Text>
    </Box>
  );
}

function ErrorMessage({ error }: { error: string }): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="red" bold>
        ✖ Error
      </Text>
      <Text color="red">{error}</Text>
      <Text color="gray" dimColor>
        Make sure BAGS_API_KEY and SOLANA_RPC_URL environment variables are set.
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App(): React.JSX.Element {
  const { exit } = useApp();
  const [tokens, setTokens] = useState<BagsTokenLeaderBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [filterRecent, setFilterRecent] = useState(true);

  const COL_WIDTHS = [5, 10, 18, 16, 12, 14, 10, 12] as const;

  const displayedTokens = filterRecent ? tokens.filter(isUpdatedWithin7Days) : tokens;

  const fetchTokens = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const apiKey = process.env['BAGS_API_KEY'] ?? '';
      const rpcUrl = process.env['SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com';

      if (apiKey.length === 0) {
        throw new Error('BAGS_API_KEY environment variable is not set');
      }

      const connection = new Connection(rpcUrl, 'confirmed');
      const sdk = new BagsSDK(apiKey, connection, 'confirmed');

      const results = await sdk.state.getTopTokensByLifetimeFees();
      setTokens(results);
      setLastRefreshed(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTokens();
  }, []);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }

    if (input === 'r') {
      void fetchTokens();
      return;
    }

    if (input === 'f') {
      setFilterRecent((prev) => !prev);
      setSelectedIndex(0);
      setExpandedIndex(null);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      setExpandedIndex(null);
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(displayedTokens.length - 1, prev + 1));
      setExpandedIndex(null);
    }

    if (key.return) {
      setExpandedIndex((prev) => (prev === selectedIndex ? null : selectedIndex));
    }
  });

  return (
    <Box flexDirection="column">
      <Header filterActive={filterRecent} />

      {loading ? (
        <Spinner label="Fetching top tokens by lifetime fees…" />
      ) : error !== null ? (
        <ErrorMessage error={error} />
      ) : (
        <Box flexDirection="column">
          {lastRefreshed !== null ? (
            <Text color="gray" dimColor>
              Last refreshed: {lastRefreshed.toLocaleTimeString()} —{' '}
              {String(displayedTokens.length)}
              {filterRecent ? `/${String(tokens.length)}` : ''} tokens
              {filterRecent ? ' (updated last 7 days)' : ''}
            </Text>
          ) : null}

          <Box marginTop={1} flexDirection="column">
            <TableHeader widths={COL_WIDTHS} />
            <Text color="gray">{'─'.repeat(95)}</Text>

            {displayedTokens.map((item, i) => (
              <Box key={item.token} flexDirection="column">
                <TokenRow
                  index={i}
                  item={item}
                  widths={COL_WIDTHS}
                  isSelected={i === selectedIndex}
                />
                {expandedIndex === i ? <CreatorsSection item={item} /> : null}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Footer filterActive={filterRecent} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

render(<App />);
