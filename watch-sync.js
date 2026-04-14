/**
 * Auto Git Sync — watches for file changes and pushes to GitHub automatically
 * Run: node watch-sync.js
 */

const chokidar = require('chokidar');
const { execSync } = require('child_process');
const path = require('path');

const ROOT = __dirname;

// Folders/files to ignore
const IGNORED = [
  /node_modules/,
  /\.git/,
  /public\/uploads/,
  /uploads/,
  /\.log$/,
  /\.env$/,
];

let debounceTimer = null;
let pendingFiles = new Set();

function shouldIgnore(filePath) {
  return IGNORED.some(pattern => pattern.test(filePath));
}

function timestamp() {
  return new Date().toLocaleTimeString('en-IN', { hour12: false });
}

function autoSync() {
  const files = [...pendingFiles].map(f => path.relative(ROOT, f)).join(', ');
  pendingFiles.clear();

  try {
    execSync('git add .', { cwd: ROOT });

    // Check if there's anything to commit
    const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    if (!status) {
      console.log(`[${timestamp()}] No changes to commit.`);
      return;
    }

    const msg = `auto-sync: ${new Date().toISOString()}`;
    execSync(`git commit -m "${msg}"`, { cwd: ROOT });
    execSync('git push origin main', { cwd: ROOT });

    console.log(`[${timestamp()}] ✅ Pushed to GitHub — changed: ${files}`);
  } catch (err) {
    console.error(`[${timestamp()}] ❌ Sync failed:`, err.message);
  }
}

// Watch all files
const watcher = chokidar.watch(ROOT, {
  ignored: (filePath) => shouldIgnore(filePath),
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 1000,
    pollInterval: 100,
  },
});

watcher.on('all', (event, filePath) => {
  if (shouldIgnore(filePath)) return;
  pendingFiles.add(filePath);

  // Debounce — wait 3 seconds after last change before committing
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(autoSync, 3000);

  console.log(`[${timestamp()}] 📝 Detected: ${event} → ${path.relative(ROOT, filePath)}`);
});

console.log('');
console.log('🔄 Aiyashi Auto-Sync started');
console.log('📁 Watching for file changes...');
console.log('🚀 Will auto-commit and push to GitHub on every save');
console.log('⛔ Press Ctrl+C to stop');
console.log('');
