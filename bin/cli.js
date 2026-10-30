#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const isGlobal = args.includes('--global') || args.includes('-g');
const isHelp = args.includes('--help') || args.includes('-h');

if (isHelp) {
  console.log(`
  \x1b[1m\x1b[36mUnderhood Skill Installer\x1b[0m
  Deep codebase comprehension and architectural diagnostic scanner.

  \x1b[1mUSAGE:\x1b[0m
    npx underhood init          Install into current workspace (local)
    npx underhood init --global Install into global configs (~/.gemini, ~/.claude)
    npx underhood --help        Show this help message
  `);
  process.exit(0);
}

console.log(`
\x1b[1m\x1b[34m
   __  __          __               __                       __
  / / / /____  ___/ /___   _____   / /_   ____   ____   ____/ /
 / / / // __ \\/ __  // _ \\ / ___/  / __ \\ / __ \\ / __ \\ / __  / 
/ /_/ // / / // /_/ //  __// /     / / / // /_/ // /_/ // /_/ /  
\\____//_/ /_/ \\__,_/ \\___//_/     /_/ /_/ \\____/ \\____/ \\__,_/   
\x1b[0m
\x1b[2m  Stop skimming. Pop the hood. Own the code.\x1b[0m
`);

const packageRoot = path.resolve(__dirname, '..');
const targetRoot = isGlobal ? os.homedir() : process.cwd();

console.log(`\x1b[36m⚙️  Installing /underhood to ${isGlobal ? 'global user directory' : 'current project'}...\x1b[0m\n`);

function copyFileSafe(srcRel, destRel) {
  const src = path.join(packageRoot, srcRel);
  const dest = path.join(targetRoot, destRel);

  if (!fs.existsSync(src)) {
    return false;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`  \x1b[32m✔\x1b[0m Created \x1b[1m${destRel}\x1b[0m`);
  return true;
}

try {
  if (isGlobal) {
    // Global installation
    copyFileSafe('.agents/skills/underhood/SKILL.md', '.gemini/config/skills/underhood/SKILL.md');
    copyFileSafe('.claude/commands/underhood.md', '.claude/commands/underhood.md');
  } else {
    // Project local installation across all major agent folders
    copyFileSafe('.agents/skills/underhood/SKILL.md', '.agents/skills/underhood/SKILL.md');
    copyFileSafe('.claude/commands/underhood.md', '.claude/commands/underhood.md');
    copyFileSafe('.cursor/rules/underhood.mdc', '.cursor/rules/underhood.mdc');
    copyFileSafe('.windsurf/rules/underhood.md', '.windsurf/rules/underhood.md');
    copyFileSafe('commands/underhood.toml', 'commands/underhood.toml');
  }

  console.log(`
\x1b[1m\x1b[32m✨ /underhood skill successfully installed!\x1b[0m

\x1b[1mHOW TO USE:\x1b[0m
  Open your AI coding agent (Antigravity, Claude Code, Cursor, Windsurf, OpenCode) and type:

  \x1b[36m/underhood\x1b[0m               Instant architecture & critical path map in 60s
  \x1b[36m/underhood this repo\x1b[0m     Full mechanical analysis with primary execution trace
  \x1b[36m/underhood pr 14\x1b[0m         Audit PR for broken invariants & regression risks
  \x1b[36m/underhood src/core/\x1b[0m     Deep-dive on a specific subsystem or folder
  `);
} catch (err) {
  console.error(`\x1b[31m❌ Installation failed:\x1b[0m`, err.message);
  process.exit(1);
}
