#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

// Clean up old binary
const binaryPath = path.join(
  os.homedir(),
  '.config',
  'nexus',
  process.platform === 'win32' ? 'nexus.exe' : 'nexus'
);

try {
  fs.unlinkSync(binaryPath);
} catch (e) {
  /* ignore if file doesn't exist */
}

// Print welcome message
console.log('\n');
console.log('🎉 Welcome to Nexus!');
console.log('\n');
console.log('To get started:');
console.log('  1. cd to your project directory');
console.log('  2. Run: nexus');
console.log('\n');
console.log('Example:');
console.log('  $ cd ~/my-project');
console.log('  $ nexus');
console.log('\n');
console.log('For more information, visit: https://nexus.com/docs');
console.log('\n');
