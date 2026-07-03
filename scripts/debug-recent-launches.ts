/**
 * Diagnostic for recent-launch seeding.
 *
 * Hits the Jupiter data API (the source bags.fm uses) for recent Bags launches
 * and prints the age distribution plus what fetchRecentLaunches() would seed.
 *
 * Run: bun scripts/debug-recent-launches.ts [hours]
 */

import { fetchRecentLaunches, BAGS_LAUNCHPAD, JUPITER_DATAPI_POOLS_URL } from '../src/sdk/recent-launches.js';

function fmtAge(ms: number): string {
  const h = ms / 3_600_000;
  return h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
}

async function main(): Promise<void> {
  const hours = Number(process.argv[2] ?? '12');
  const url = `${JUPITER_DATAPI_POOLS_URL}?launchpads=${BAGS_LAUNCHPAD}&sortBy=createdAt`;

  console.log('=== source ===');
  console.log('URL          :', url);
  console.log('window (hours):', hours);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  console.log('status       :', res.status);
  const data = (await res.json()) as { pools?: { createdAt?: string; baseAsset?: { symbol?: string; id?: string } }[] };
  const pools = data.pools ?? [];
  console.log('pools returned:', pools.length);

  const now = Date.now();
  const ages = pools
    .map((p) => ({
      symbol: p.baseAsset?.symbol ?? '?',
      id: p.baseAsset?.id ?? '?',
      ageMs: now - new Date(p.createdAt ?? '').getTime(),
    }))
    .filter((a) => Number.isFinite(a.ageMs))
    .sort((a, b) => a.ageMs - b.ageMs);

  console.log('\n=== counts within window ===');
  for (const h of [1, 6, 12, 24, 72]) {
    console.log(`<= ${String(h).padStart(3)}h : ${ages.filter((a) => a.ageMs <= h * 3_600_000).length}`);
  }

  console.log('\n=== 10 newest ===');
  for (const a of ages.slice(0, 10)) {
    console.log(`${fmtAge(a.ageMs).padStart(7)}  ${a.symbol.padEnd(10)}  ${a.id}`);
  }

  console.log('\n=== fetchRecentLaunches() result ===');
  const events = await fetchRecentLaunches(hours);
  console.log(`events within ${hours}h:`, events.length);
  for (const e of events.slice(0, 10)) {
    console.log(`  ${e.symbol.padEnd(10)} ${e.mint}`);
  }
}

main().catch((e: unknown) => {
  console.error('debug failed:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
