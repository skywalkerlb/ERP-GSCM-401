// npm run simulate [-- --end YYYY-MM-DD --days N]: simulate in memory (no database) and print realism statistics.
import { defaultOptions, simulate } from './simulate.js';
import { printReport } from './report.js';

const t0 = Date.now();
const res = simulate(defaultOptions(process.argv.slice(2)));
console.log(`Simulated ${res.events.length.toLocaleString('en-US')} events in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const checks = printReport(res);
process.exit(checks.fails.length ? 1 : 0);
