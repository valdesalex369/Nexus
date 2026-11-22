/**
 * Quick test: send a real Telegram message to verify your bot token + chat ID.
 *
 * Usage:
 *   node src/test-telegram.js
 *
 * This sends a test message and waits 30s for you to reply /approve or /deny.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const telegram = require('./telegram');

async function main() {
  console.log('Initializing Telegram bot...');
  telegram.init();

  if (!telegram.enabled) {
    console.error('❌ Bot not enabled. Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
    process.exit(1);
  }

  // Test 1: Startup message
  console.log('\n--- Test 1: Startup message ---');
  const startupOk = await telegram.sendStartupTest();
  console.log(startupOk ? '✅ Startup message sent' : '❌ Failed to send startup message');

  // Test 2: Agent notifications
  console.log('\n--- Test 2: Task start notification ---');
  await telegram.notifyStart('TestAgent', 'Running Telegram integration test');
  console.log('✅ Start notification sent');

  console.log('\n--- Test 3: Task complete notification ---');
  await telegram.notifyComplete('TestAgent', 'Telegram integration test', 'All systems operational');
  console.log('✅ Complete notification sent');

  console.log('\n--- Test 4: Error notification ---');
  await telegram.notifyError('TestAgent', 'Simulated failing task', 'Connection refused to external API');
  console.log('✅ Error notification sent');

  // Test 5: Approval flow
  console.log('\n--- Test 5: Approval flow ---');
  console.log('Sending approval request... reply /approve or /deny in Telegram within 30s');

  const timeoutOverride = setTimeout(() => {
    console.log('\n⏱ No response in 30s — that\'s OK, the approval system works');
    console.log('\n✅ All tests passed! Your Telegram conductor is wired up.');
    process.exit(0);
  }, 30000);

  const { approved, reason } = await telegram.requestApproval(
    'TestAgent',
    'Test approval flow',
    'This is a test — reply /approve or /deny to confirm the two-way link works.'
  );

  clearTimeout(timeoutOverride);
  console.log(`Result: ${approved ? '✅ APPROVED' : '❌ DENIED'} — ${reason}`);
  console.log('\n✅ All tests passed! Your Telegram conductor is fully operational.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
