const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Claude Plugin and Marketplace manifests are valid and configured', (t) => {
  const pluginManifestPath = path.join(root, '.claude-plugin', 'plugin.json');
  const marketplaceManifestPath = path.join(root, '.claude-plugin', 'marketplace.json');

  assert.ok(fs.existsSync(pluginManifestPath), '.claude-plugin/plugin.json must exist');
  assert.ok(fs.existsSync(marketplaceManifestPath), '.claude-plugin/marketplace.json must exist');

  const plugin = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf8'));
  const marketplace = JSON.parse(fs.readFileSync(marketplaceManifestPath, 'utf8'));

  assert.strictEqual(plugin.name, 'underhood');
  assert.strictEqual(plugin.version, '1.0.0');
  assert.ok(plugin.description && plugin.description.length > 20);
  assert.ok(plugin.author && plugin.author.name);
  assert.strictEqual(plugin.license, 'MIT');

  assert.strictEqual(marketplace.name, 'underhood-marketplace');
  assert.ok(Array.isArray(marketplace.plugins));
  assert.ok(marketplace.plugins.some(p => p.name === 'underhood'));

  assert.ok(fs.existsSync(path.join(root, 'skills', 'underhood', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(root, 'commands', 'underhood.md')));
});
