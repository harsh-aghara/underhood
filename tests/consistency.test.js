const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execSync } = require('node:child_process');

test('All agent adapters are byte-consistent with AGENTS.md', (t) => {
  const scriptPath = path.resolve(__dirname, '..', 'scripts', 'check-rule-copies.js');
  const output = execSync(`node "${scriptPath}"`, { stdio: 'pipe' }).toString();
  assert.ok(output.includes('100% consistent across all agents'));
});
