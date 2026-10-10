import assert from 'assert';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { intentParserService } from '../src/services/intentParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

const BASE_URL = 'http://localhost:3001';

async function waitForServer(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(`${BASE_URL}/api/health`, { timeout: 1000 });
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 600));
    }
  }
  return false;
}

async function runSectorGuardrailTests() {
  console.log('=== [TEST] Starting Sector Availability & Rejection Guardrail Tests ===\n');

  // 1. Direct Intent Parser Unit Test on Military Prompt
  console.log('1. Testing intentParserService.parseIntent with military prompt...');
  const militaryPrompt = "Build a 3 military equipment company basket, hedged with 30% US Treasury yield";
  const intentResult = await intentParserService.parseIntent(militaryPrompt, 97);

  console.log('   IntentParser result status:', intentResult.status);
  console.log('   Missing Sector detected:', intentResult.missingSector);
  console.log('   Rejection Message:', intentResult.message);
  console.log('   Suggested alternatives:', intentResult.suggestedThemes);

  assert.strictEqual(intentResult.status, 'UNSUPPORTED_THEME', 'Military prompt must be flagged as UNSUPPORTED_THEME');
  assert(intentResult.missingSector.includes('Military') || intentResult.missingSector.includes('Defense'), 'Must flag Military or Defense');
  console.log('   [PASS] IntentParser guardrail unit test passed!\n');

  // 2. Server API Integration Test
  console.log('2. Testing POST /api/synthesize over HTTP...');
  let serverProcess = null;
  try {
    await axios.get(`${BASE_URL}/api/health`, { timeout: 1000 });
    console.log('   Server is already running on :3001.');
  } catch (e) {
    console.log('   Auto-starting server on :3001 for test...');
    serverProcess = spawn(process.execPath, [path.join(backendDir, 'src/server.js')], {
      cwd: backendDir,
      stdio: 'pipe'
    });
    const ready = await waitForServer();
    if (!ready) throw new Error('Server failed to start within timeout');
    console.log('   Server started successfully.');
  }

  // Expect HTTP 422 on military equipment prompt
  try {
    console.log('   Sending POST /api/synthesize with military equipment prompt...');
    const res = await axios.post(`${BASE_URL}/api/synthesize`, {
      prompt: militaryPrompt,
      investmentAmount: 100,
      chainId: 97
    });
    assert.fail('Expected HTTP 422 error, but request succeeded with 200: ' + JSON.stringify(res.data));
  } catch (err) {
    if (!err.response) {
      console.error('   Network/Connection error without HTTP response:', err.message);
      throw err;
    }
    assert.strictEqual(err.response?.status, 422, 'Expected HTTP 422 Unprocessable Entity');
    const body = err.response?.data;
    console.log('   HTTP 422 Response received:');
    console.log('   - Code:', body.code);
    console.log('   - Missing Sector:', body.missingSector);
    console.log('   - Message:', body.message);
    assert.strictEqual(body.code, 'UNSUPPORTED_THEME');
    assert(body.missingSector.includes('Military') || body.missingSector.includes('Defense'));
    assert(Array.isArray(body.suggestedThemes), 'Must return suggested themes');
    console.log('   [PASS] HTTP 422 Rejection Guardrail verified!\n');
  }

  // 3. Test that valid themes still synthesize with 200 OK
  console.log('3. Testing valid supported theme (AI + Yield) still returns 200 OK...');
  const validPrompt = "Build an AI-infrastructure basket of Nvidia, Apple, and TSMC, hedged with 30% US Treasury yield";
  const validRes = await axios.post(`${BASE_URL}/api/synthesize`, {
    prompt: validPrompt,
    investmentAmount: 100,
    chainId: 97
  });

  assert.strictEqual(validRes.status, 200);
  assert.strictEqual(validRes.data.success, true);
  console.log('   [PASS] Valid prompt synthesized with 200 OK across', validRes.data.portfolio.allocations.length, 'bStocks:');
  validRes.data.portfolio.allocations.forEach(a => console.log(`   - ${a.symbol}: ${a.weight}%`));
  console.log('   [PASS] System correctly discriminates between supported vs unsupported sectors.\n');

  if (serverProcess) {
    serverProcess.kill();
  }

  console.log('================================================================');
  console.log('ALL SECTOR GUARDRAIL TESTS PASSED! No false portfolios allowed.');
  console.log('================================================================');
}

runSectorGuardrailTests().catch(err => {
  console.error('[TEST FAILED]:', err);
  process.exit(1);
});
