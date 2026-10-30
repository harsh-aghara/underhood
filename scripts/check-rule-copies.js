#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n').trim();
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

const canonical = read('AGENTS.md');

const copies = [
  ['.agents/skills/underhood/SKILL.md', stripFrontmatter],
  ['.cursor/rules/underhood.mdc', stripFrontmatter],
  ['.windsurf/rules/underhood.md', text => text.trim()]
];

let failed = false;

for (const [relPath, normalize] of copies) {
  const actual = normalize(read(relPath));
  if (actual !== canonical) {
    console.error(`❌ ${relPath} drifted from AGENTS.md`);
    failed = true;
  } else {
    console.log(`✔ ${relPath} matches canonical AGENTS.md`);
  }
}

// Invariants check: Ensure load-bearing sections survive in all adapters
const INVARIANTS = [
  '## 1. Scale & Topology Calibration',
  '## 2. Technical Analysis Requirements',
  'Section 1: System Topology & Core State Engine',
  'Section 2: Primary Execution Path Trace',
  'Section 3: Architectural Decisions & System Contracts',
  'Section 4: Operational Boundaries & Failure Modes',
  'Section 5: Specification vs. Implementation Audit',
  'Execution Discipline: Reading Sequence',
  'Do not examine peripheral utilities, data schemas, or configuration files first',
  'root-cause state level (in-memory data structures, pointers/references',
  '[VERIFIED: Implementation matches documented specification]'
];

const allAdapters = [
  '.agents/skills/underhood/SKILL.md',
  '.cursor/rules/underhood.mdc',
  '.windsurf/rules/underhood.md',
  '.claude/commands/underhood.md'
];

for (const relPath of allAdapters) {
  const content = read(relPath);
  for (const inv of INVARIANTS) {
    if (!content.includes(inv)) {
      console.error(`❌ Invariant missing in ${relPath}: "${inv}"`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\n🚨 Rule consistency check failed! Adapter files have drifted.');
  process.exit(1);
} else {
  console.log('\n✨ All adapters and rules are 100% consistent across all agents.');
}
