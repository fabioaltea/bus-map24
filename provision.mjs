#!/usr/bin/env node
// Cross-platform provisioning script for bus-map24 (macOS + Windows + Linux).
//
// Installs system deps, starts Postgres/PostGIS + Redis, creates DB + user,
// installs pnpm deps for both projects, runs Drizzle migrations, imports a
// GTFS feed.
//
// Usage:
//   node provision.mjs
//   node provision.mjs --skip-install
//   node provision.mjs --skip-import
//   node provision.mjs --mobility-id tld-576
//   node provision.mjs --feed-url https://... --provider "My Transit"
//
// Requirements:
//   macOS:   Homebrew (https://brew.sh)
//   Windows: Chocolatey (https://chocolatey.org) OR winget, run as Administrator
//   Linux:   apt-get (Debian/Ubuntu). PostGIS + Redis packages installed manually otherwise.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, copyFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform } from 'node:os'

const ROOT = dirname(fileURLToPath(import.meta.url))
const API_DIR = join(ROOT, 'bus-map-api')
const WEB_DIR = join(ROOT, 'bus-map-web')
const OS = platform() // 'darwin' | 'win32' | 'linux'
const IS_WIN = OS === 'win32'

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const val = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const SKIP_INSTALL = flag('--skip-install')
const SKIP_IMPORT = flag('--skip-import')
const MOBILITY_ID = val('--mobility-id', 'tld-576')
const FEED_URL = val('--feed-url')
const FEED_PROVIDER = val('--provider', 'Manual')

// ── logging ─────────────────────────────────────────────────────────────────
const C = {
  info: '\x1b[1;34m',
  warn: '\x1b[1;33m',
  err: '\x1b[1;31m',
  reset: '\x1b[0m',
}
const log = (m) => console.log(`${C.info}[provision]${C.reset} ${m}`)
const warn = (m) => console.log(`${C.warn}[provision]${C.reset} ${m}`)
const die = (m) => {
  console.error(`${C.err}[provision]${C.reset} ${m}`)
  process.exit(1)
}

// ── shell helpers ───────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  const { cwd, shell = true, ignoreError = false } = opts
  const res = spawnSync(cmd, { cwd, shell, stdio: 'inherit' })
  if (res.status !== 0 && !ignoreError) die(`Command failed: ${cmd}`)
  return res.status === 0
}

function runCapture(cmd) {
  const res = spawnSync(cmd, { shell: true, encoding: 'utf8' })
  return { ok: res.status === 0, out: (res.stdout || '').trim(), err: (res.stderr || '').trim() }
}

function has(bin) {
  const probe = IS_WIN ? `where ${bin}` : `command -v ${bin}`
  return runCapture(probe).ok
}

// ── system dependency installation ──────────────────────────────────────────
function installDepsMac() {
  if (!has('brew')) die('Homebrew not found. Install from https://brew.sh')
  const pkgs = ['postgresql@17', 'postgis', 'redis', 'tippecanoe', 'pnpm', 'node@22']
  for (const p of pkgs) {
    if (!runCapture(`brew list ${p}`).ok) {
      log(`brew install ${p}`)
      run(`brew install ${p}`)
    }
  }
  // PATH for postgresql@17 (keg-only)
  const brewPrefix = runCapture('brew --prefix postgresql@17').out
  if (brewPrefix) process.env.PATH = `${brewPrefix}/bin:${process.env.PATH}`
}

function installDepsWin() {
  const useChoco = has('choco')
  const useWinget = !useChoco && has('winget')
  if (!useChoco && !useWinget)
    die('Neither Chocolatey nor winget found. Install choco from https://chocolatey.org')

  const pkgsChoco = ['postgresql17', 'postgis', 'redis-64', 'nodejs-lts', 'pnpm']
  const pkgsWinget = [
    'PostgreSQL.PostgreSQL.17',
    'Redis.Redis',
    'OpenJS.NodeJS.LTS',
    'pnpm.pnpm',
  ]

  if (useChoco) {
    log('Installing via Chocolatey (requires Administrator shell)')
    run(`choco install -y ${pkgsChoco.join(' ')}`)
  } else {
    log('Installing via winget')
    for (const p of pkgsWinget) run(`winget install --silent --accept-package-agreements --accept-source-agreements -e --id ${p}`, { ignoreError: true })
    warn('winget has no PostGIS package — install PostGIS manually via StackBuilder after provisioning')
  }
  warn('tippecanoe has no native Windows build. Use WSL2 for PMTiles generation.')
}

function installDepsLinux() {
  if (!has('apt-get')) {
    warn('Non-Debian Linux detected. Install postgresql-16, postgis, redis-server, tippecanoe, node@22, pnpm manually.')
    return
  }
  run('sudo apt-get update')
  run('sudo apt-get install -y postgresql postgresql-contrib postgis redis-server tippecanoe curl')
  if (!has('node')) run('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs')
  if (!has('pnpm')) run('npm install -g pnpm')
}

// ── service management ─────────────────────────────────────────────────────
function startServices() {
  if (OS === 'darwin') {
    log('Starting postgresql@17 and redis (brew services)')
    run('brew services start postgresql@17', { ignoreError: true })
    run('brew services start redis', { ignoreError: true })
  } else if (IS_WIN) {
    log('Starting Windows services: postgresql, Redis')
    run('net start postgresql-x64-17', { ignoreError: true })
    run('net start Redis', { ignoreError: true })
  } else {
    log('Starting postgresql and redis-server (systemctl)')
    run('sudo systemctl start postgresql', { ignoreError: true })
    run('sudo systemctl start redis-server', { ignoreError: true })
  }
}

function waitForPostgres() {
  log('Waiting for Postgres')
  for (let i = 0; i < 30; i++) {
    if (runCapture('pg_isready').ok) return
    const waitCmd = IS_WIN ? 'powershell -c "Start-Sleep -Seconds 1"' : 'sleep 1'
    spawnSync(waitCmd, { shell: true })
  }
  die('Postgres not ready after 30s')
}

// ── DB setup ────────────────────────────────────────────────────────────────
function psql(sql, db = 'postgres') {
  // On mac/linux we typically connect as current OS user (superuser postgres
  // via peer auth on linux, current user on mac). On Windows use -U postgres.
  const userFlag = IS_WIN ? '-U postgres' : ''
  const cmd = `psql ${userFlag} -d ${db} -tAc "${sql.replace(/"/g, '\\"')}"`
  return runCapture(cmd)
}

function setupDatabase() {
  log('Ensuring DB busmapdb, user busmap, PostGIS extension')
  const dbExists = psql("SELECT 1 FROM pg_database WHERE datname='busmapdb'").out === '1'
  if (!dbExists) {
    const createCmd = IS_WIN
      ? 'createdb -U postgres busmapdb'
      : 'createdb busmapdb'
    run(createCmd)
  }
  const userExists = psql("SELECT 1 FROM pg_roles WHERE rolname='busmap'").out === '1'
  if (!userExists) psql("CREATE USER busmap WITH PASSWORD 'busmap';")
  psql('GRANT ALL PRIVILEGES ON DATABASE busmapdb TO busmap;')
  psql('ALTER DATABASE busmapdb OWNER TO busmap;')
  psql('CREATE EXTENSION IF NOT EXISTS postgis;', 'busmapdb')
  psql('GRANT ALL ON SCHEMA public TO busmap;', 'busmapdb')
}

// ── .env files ──────────────────────────────────────────────────────────────
function ensureEnvFiles() {
  const apiEnv = join(API_DIR, '.env')
  const apiExample = join(API_DIR, '.env.example')
  if (!existsSync(apiEnv) && existsSync(apiExample)) {
    log(`Creating ${apiEnv}`)
    copyFileSync(apiExample, apiEnv)
  }
  const webEnv = join(WEB_DIR, '.env.local')
  if (!existsSync(webEnv)) {
    log(`Creating ${webEnv}`)
    writeFileSync(
      webEnv,
      [
        'VITE_API_URL=http://localhost:3000',
        'VITE_API_BASE_URL=http://localhost:3000/api',
        'VITE_TILES_BASE_URL=http://localhost:3000/tiles',
        'VITE_MOCK_API=false',
        '',
      ].join('\n'),
    )
  }
}

// ── project setup ──────────────────────────────────────────────────────────
function pnpmInstallAll() {
  if (!has('pnpm')) die('pnpm not found after install step. Re-open your shell and retry.')
  log('pnpm install (bus-map-api)')
  run('pnpm install', { cwd: API_DIR })
  log('pnpm install (bus-map-web)')
  run('pnpm install', { cwd: WEB_DIR })
}

function runMigrations() {
  log('Drizzle migrations')
  run('pnpm db:migrate', { cwd: API_DIR })
}

function importFeed() {
  if (SKIP_IMPORT) {
    warn('Skipping GTFS import')
    return
  }
  if (FEED_URL) {
    log(`Importing feed from URL: ${FEED_URL}`)
    run(`pnpm import-feed --url "${FEED_URL}" --provider "${FEED_PROVIDER}"`, { cwd: API_DIR })
  } else {
    log(`Importing MobilityDatabase feed: ${MOBILITY_ID}`)
    run(`pnpm import-feed --mobility-id ${MOBILITY_ID}`, { cwd: API_DIR })
  }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  log(`OS: ${OS}`)
  if (!SKIP_INSTALL) {
    if (OS === 'darwin') installDepsMac()
    else if (IS_WIN) installDepsWin()
    else installDepsLinux()
  } else {
    warn('Skipping system dependency install')
  }

  startServices()
  waitForPostgres()
  setupDatabase()
  ensureEnvFiles()
  pnpmInstallAll()
  runMigrations()
  importFeed()

  log('Done.')
  console.log('\nNext:')
  console.log('  cd bus-map-api && pnpm dev   # API on http://localhost:3000')
  console.log('  cd bus-map-web && pnpm dev   # Web on http://localhost:5173')
}

main().catch((e) => die(e?.message ?? String(e)))
