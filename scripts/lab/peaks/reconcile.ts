import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import type { SourceRow } from '../../../src/features/lab/peaks/types';

/** Independent row-key reconciliation, not just matching grand totals. */
export async function reconcileMonths(rows: SourceRow[]) {
  const files = (await readdir('data/midstop-months')).filter(f=>/^202[45]-\d{2}-01\.json$/.test(f)).sort();
  const expected = Array.from({length:24},(_,i)=>`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}-01.json`);
  assert.deepEqual(files, expected, 'All 24 exact monthly files required');
  const keys = new Map<string, [number,number]>();
  for (const row of rows) {
    const key = JSON.stringify(row.slice(0,5));
    assert(!keys.has(key), `Duplicate merged key ${key}`);
    keys.set(key, [row[5],row[6]]);
  }
  let checked = 0;
  for (const file of files) {
    const source: SourceRow[] = JSON.parse(await readFile(`data/midstop-months/${file}`,'utf8'));
    for (const row of source) {
      assert.equal(row[0].slice(0,7), file.slice(0,7));
      const key = JSON.stringify(row.slice(0,5));
      assert.deepEqual(keys.get(key), [row[5],row[6]], `Monthly value/key mismatch ${key}`);
      keys.delete(key); checked++;
    }
  }
  assert.equal(keys.size,0,'Merged keys missing from monthly cache');
  return { months: files.length, keys: checked, status: 'exact_key_match' as const };
}
