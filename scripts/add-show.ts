// Usage: pnpm tsx scripts/add-show.ts <apple podcasts link | rss url>
import 'dotenv/config'
import { addShow } from '@/lib/shows'

addShow(process.argv[2] ?? '').then((s) => { console.log(`Added "${s.title}" (/${s.slug})`); process.exit(0) })
  .catch((e) => { console.error(e.message); process.exit(1) })
