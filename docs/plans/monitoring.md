## How to Monitor On-Chain for New Bags.fm Token Launches

There are three primary approaches for monitoring Bags.fm token launches in real-time, each with distinct trade-offs in latency, complexity, and reliability.

### Official Approach: Bags ReStream Service

The recommended method is Bags' native **ReStream** service, a managed WebSocket streaming platform purpose-built for BAGS developers. The service delivers filtered on-chain events directly to your application with ultra-low latency by tapping directly into Solana leaders. [github](https://github.com/Tru3Bliss/solana-token-bundler-pumpfun-pump.fun-bonkfun-bonk.fun)

**Setup with TypeScript/Node.js SDK:** [github](https://github.com/rustyneuron01/Volume-Bundler-Sniping-Copy-Trading-Bot-Rust)

```typescript
import { RestreamClient, RestreamLaunchpadLaunchSubscriptionHandler, LaunchpadLaunchEvent } from "@bagsfm/bags-sdk";

const client = new RestreamClient();

async function main() {
  // Connect to ReStream service
  await client.connect();
  
  // Define event handler for token launches
  const launchHandler: RestreamLaunchpadLaunchSubscriptionHandler = (
    launchData: LaunchpadLaunchEvent,
    meta: { channel: string; topic: string; subject: string }
  ) => {
    console.log(`New token launch detected: ${launchData.mint}`);
    // Process launch data
  };
  
  // Subscribe to all Bags launches
  client.subscribeBagsLaunches(launchHandler);
  
  // Event lifecycle monitoring
  client.on("reconnected", ({ attempts }) => 
    console.log(`Reconnected after ${attempts} attempts`)
  );
  
  // Graceful shutdown
  process.on("SIGINT", async () => {
    await client.disconnect();
    process.exit(0);
  });
}

main();
```

**ReStream SDK Features:** [github](https://github.com/rustyneuron01/Volume-Bundler-Sniping-Copy-Trading-Bot-Rust)
- Automatic reconnection with exponential backoff
- Built-in Protocol Buffer message decoding
- Type-safe TypeScript event handlers
- Comprehensive error handling (socket errors, reconnection errors, handler errors)
- Subscription lifecycle management

**Connection Details:** [github](https://github.com/Matt-Aurora-Ventures/Jarvis)
- **Endpoint:** `wss://restream.bags.fm`
- **Event Topic Format:** `launchpad_launch:BAGS` (or `launchpad_launch:*` for wildcard)
- **Limitation:** Currently in beta—expect occasional outages during updates
- **Concurrency:** Maximum 5 wildcard subscriptions per client

### Alternative: Bitquery GraphQL API

For applications requiring historical data or additional context, **Bitquery** provides comprehensive Bags.fm blockchain data via GraphQL subscriptions. This approach offers sub-400ms latency and includes USD price streams, token transfers, and DEX trades alongside launch detection. [github](https://github.com/fairrustana)

**Key Capabilities:** [github](https://github.com/fairrustana)
- **New Token Creation Tracking** — Monitor Bags Creator program instructions in real-time
- **Real-Time Pricing** — USD prices for all Bags tokens vs quote currencies (SOL, USDC)
- **Trade Monitoring** — Latest DEX trades across all Solana DEXs
- **Kafka Streaming** — Unlimited data throughput without interruption for high-volume use cases
- **Custom Endpoints** — Available for specialized monitoring requirements

**Bitquery requires an API key** available from `account.bitquery.io`, but the REST API provides free access to historical data.

### Technical Alternative: Yellowstone gRPC

For developers requiring sub-second latency or custom filtering logic, **Yellowstone gRPC** from providers like Helius, QuickNode, GetBlock, or Chainstack enables ultra-low-latency monitoring of Solana blockchain entries. This approach requires identifying the Bags Creator program and monitoring specific transaction types. [dev](https://dev.to/sivarampg/bagsfm-the-solana-launchpad-thats-changing-creator-monetization-4g7n)

**Advantages:** 100-400ms latency, bidirectional streaming, direct validator connections  
**Trade-offs:** Requires manual protobuf decoding and instruction filtering; more setup overhead than ReStream

***

| **Approach** | **Latency** | **Setup Time** | **Maintenance** | **Best For** |
|---|---|---|---|---|
| **ReStream (Recommended)** | Ultra-low | <5 minutes | Minimal | Production applications, real-time snipers, trading bots |
| **Bitquery API** | <400ms | <5 minutes | None | Dashboards, analytics, multi-data integration |
| **Yellowstone gRPC** | 100-400ms | 1-2 hours | Moderate | Custom filtering, advanced signal processing |

### Implementation Considerations

**Data Validation:** Upon detection, cross-reference new token mints with the Bags SDK's `getTokenCreators()` method to retrieve creator information and royalty splits—useful for filtering launches by creator type (AI projects, verified creators, etc.).

**Rate Management:** During peak activity, Bags.fm processes over 3,900 token launches per day. Your monitoring system should handle burst throughput and implement backpressure mechanisms to avoid downstream processing bottlenecks. [docs.bags](https://docs.bags.fm)

**Fallback Strategy:** For production systems, combine ReStream as primary with Bitquery as fallback. If ReStream encounters issues (beta service), Bitquery provides reliable coverage with built-in error recovery.



I've created an interactive Bags ReStream sniper bot demonstration interface. This educational interface shows how to configure and monitor a sniper bot with real-time launch detection, token validation, and buy execution tracking.

**Key Features:**
- **Bot Configuration**: API key, RPC endpoint, wallet, buy amount, slippage settings
- **Advanced Filters**: LP range, token safety checks (renounced mint, freezable authority)
- **Event Logging**: Real-time stream of token launches and validation results
- **Transaction History**: Track executed buys with signatures
- **Statistics**: Live counters for launches detected, validated, and successful buys
- **Simulation**: Realistic async behavior mimicking actual bot operations

**To Build a Production Sniper Bot:**

1. Use the TypeScript implementation from the research notes with the Bags SDK
2. Deploy as a Node.js server with ReStream WebSocket connection
3. Integrate Jupiter API for swap quotes and transactions
4. Implement Solana transaction signing with your sniper wallet keypair
5. Add Jito bundle support for MEV protection
6. Set up proper error handling and RPC fallback strategies

**Resource**: Full implementation guide saved to `/workspace/bags_restream_sniper_bot.md`
