const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

test('CLI installer creates expected files in current workspace', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'underhood-test-'));
  const cliPath = path.resolve(__dirname, '..', 'bin', 'cli.js');

  try {
    execSync(`node "${cliPath}" init`, { cwd: tempDir, stdio: 'pipe' });

    assert.ok(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'underhood', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(tempDir, '.claude', 'commands', 'underhood.md')));
    assert.ok(fs.existsSync(path.join(tempDir, '.cursor', 'rules', 'underhood.mdc')));
    assert.ok(fs.existsSync(path.join(tempDir, '.windsurf', 'rules', 'underhood.md')));
    assert.ok(fs.existsSync(path.join(tempDir, 'commands', 'underhood.toml')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
