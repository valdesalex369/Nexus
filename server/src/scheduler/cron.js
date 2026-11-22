const CYCLES = [];
let intervalId = null;
let cycleCount = 0;

async function runCycle(agents, telegram, evolution) {
  const cycleId = `cycle_${Date.now()}`;
  cycleCount++;
  const startTime = Date.now();

  console.log(`[Scheduler] ====== NEXUS CYCLE ${cycleId} ======`);
  await telegram.notifyStart('Scheduler', `Cycle ${cycleCount} starting`);

  const results = {};

  try {
    // Step 1: Market scan
    console.log('[Scheduler] Step 1: Market scan');
    results.market = await agents.market.analyze('crypto', 'BTC,ETH,SOL');

    // Step 2: On-chain scan
    console.log('[Scheduler] Step 2: On-chain scan');
    results.onchain = await agents.onchain.scanWallets();

    // Step 3: MiroFish swarm consensus
    console.log('[Scheduler] Step 3: MiroFish consensus');
    results.mirofish = await agents.mirofish.runSwarm(results.market);

    // Step 4: Prediction synthesis
    console.log('[Scheduler] Step 4: Prediction');
    const weights = evolution.getWeights();
    results.prediction = await agents.prediction.predict(
      `Market: ${results.market}\nOnChain: ${results.onchain}\nSwarm: ${results.mirofish}\nWeights: ${JSON.stringify(weights)}`,
      'crypto'
    );

    // Step 5: Content generation
    console.log('[Scheduler] Step 5: Content digest');
    results.content = await agents.content.createPost(
      `Digest: Market=${results.market}\nPrediction=${results.prediction}`,
      'telegram'
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Scheduler] ====== CYCLE COMPLETE (${elapsed}s) ======`);

    await telegram.notifyComplete('Scheduler', `Cycle ${cycleCount}`, `Completed in ${elapsed}s`);

    const cycle = { id: cycleId, number: cycleCount, results, elapsed, timestamp: new Date().toISOString() };
    CYCLES.push(cycle);
    if (CYCLES.length > 100) CYCLES.shift();

    return cycle;
  } catch (err) {
    console.error(`[Scheduler] Cycle ${cycleId} failed:`, err.message);
    await telegram.notifyError('Scheduler', `Cycle ${cycleCount}`, err.message);
    return { id: cycleId, error: err.message };
  }
}

function startScheduler(agents, telegram, evolution, intervalMs = 60 * 60 * 1000) {
  if (intervalId) {
    console.log('[Scheduler] Already running');
    return;
  }

  console.log(`[Scheduler] Starting — cycle every ${intervalMs / 60000} minutes`);

  runCycle(agents, telegram, evolution);

  intervalId = setInterval(() => {
    runCycle(agents, telegram, evolution);
  }, intervalMs);
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Scheduler] Stopped');
  }
}

function getSchedulerStatus() {
  return {
    running: !!intervalId,
    cycleCount,
    lastCycle: CYCLES[CYCLES.length - 1] || null,
    totalCycles: CYCLES.length,
  };
}

function getCycles(limit = 10) {
  return CYCLES.slice(-limit);
}

module.exports = { runCycle, startScheduler, stopScheduler, getSchedulerStatus, getCycles };
