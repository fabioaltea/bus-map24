import 'dotenv/config'
import { runTileGen } from '../jobs/tile-gen.job.js'

const feedId = process.argv[2]
const mobilityId = process.argv[3] ?? feedId

if (!feedId) {
  console.error('Usage: tsx src/scripts/gen-tiles.ts <feedId> [mobilityId]')
  process.exit(1)
}

await runTileGen({ feedId, outputPath: `${mobilityId}.pmtiles` })
process.exit(0)
