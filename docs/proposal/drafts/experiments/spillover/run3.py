#!/usr/bin/env python3
"""Reproducible arrival analysis; output directory must not exist."""
import argparse, collections, datetime, json, random, statistics
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--data', required=True)
p.add_argument('--output', required=True)
p.add_argument('--limit', type=int, default=0, help='limit per year for a smoke test')
a = p.parse_args()
out = Path(a.output)
out.mkdir(parents=True, exist_ok=False)
rng = random.Random(20261111)
calendar = json.loads((Path(__file__).resolve().parents[5] / 'public/data/lab/visualization/calendar.json').read_text(encoding='utf-8'))['days']
def save(name, obj):
    with (out / name).open('x', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
def kind(d):
    w = datetime.date.fromisoformat(d).weekday()
    return 2 if calendar[d]['rest'] else 1 if w == 4 else 0
def cell(e): return (e['s'], e['dir'], kind(e['d']), e['h'])
def pct(xs, q): return sorted(xs)[int((len(xs)-1)*q)]
rows = {2024: [], 2025: []}
with open(a.data, encoding='utf-8') as f:
    for line in f:
        e = json.loads(line); y = int(e['d'][:4])
        if y in rows and (not a.limit or len(rows[y]) < a.limit): rows[y].append(e)
save('s1-input.json', {str(y):len(v) for y,v in rows.items()})
# Historical baselines, with thresholds at each level.
tables = [collections.defaultdict(lambda: [0, 0]) for _ in range(3)]
loads = collections.defaultdict(list)
for e in rows[2024]:
    k = cell(e); loads[e['s']].append(e['L'])
    for t, key in zip(tables, (k, k[:3], k[:2])):
        t[key][0] += 1; t[key][1] += e['B']
threshold = {s:pct(v, .9) for s,v in loads.items()}
fallback = collections.Counter()
def base(e):
    k = cell(e)
    for i, key in enumerate((k, k[:3], k[:2])):
        n, total = tables[i].get(key, (0,0))
        if n >= 5:
            fallback[str(i)] += 1
            return total/n
    fallback['missing'] += 1
    return None
for e in rows[2025]: e['base'] = base(e)
save('s1-baseline.json', {'2025_event_fallback_counts':dict(fallback), 'rule':'each level requires >= 5; missing excluded', 'holiday':'project government calendar; rest days take precedence'})
# Consecutive observed arrivals and latest strictly earlier opposite-direction arrival.
by = collections.defaultdict(list)
for e in rows[2025]: by[(e['d'],e['s'],e['dir'])].append(e)
for v in by.values(): v.sort(key=lambda e:(e['time'],e['v']))
pairs = []
for (d,s,di), events in by.items():
    opposite = by.get((d,s,-di), []); j = 0; previous_opp = None
    for i,e in enumerate(events):
        while j < len(opposite) and opposite[j]['time'] < e['time']:
            previous_opp = opposite[j]; j += 1
        if i and e['base'] is not None:
            prev = events[i-1]; gap = (e['time']-prev['time'])/60
            if gap <= 90:
                pairs.append((e,prev,gap,previous_opp))
save('s2-pairs.json', {str(t):sum(x[2] <= t for x in pairs) for t in (30,60,90)})
def group(load, cap): return 'low' if load < cap-10 else 'mid' if load < cap-5 else 'high'
def stats(daily):
    days=[daily.get(d, (0, 0.0)) for d in all_days]; n=sum(x[0] for x in days)
    if not n: return None
    mean=sum(x[1] for x in days)/n; boot=[]
    for _ in range(1000):
        sample=rng.choices(days,k=len(days)); count=sum(x[0] for x in sample)
        if count: boot.append(sum(x[1] for x in sample)/count)
    return {'n':n,'mean':mean,'ci':[pct(boot,.025),pct(boot,.975)], 'bootstrap_median':statistics.median(boot)}
all_days = sorted({e['d'] for e in rows[2025]})
results={}; perm_cells={}
for t in (30,60,90):
    for cap in (38,43,'top10'):
        for control in (False, True):
            daily=collections.defaultdict(lambda:collections.defaultdict(lambda:[0,0.0])); cells=collections.defaultdict(list)
            for e,prev,gap,opp in pairs:
                if gap > t or (control and (opp is None or e['time']-opp['time'] > t*60)): continue
                load=(opp if control else prev)['L']
                if cap == 'top10':
                    if e['s'] not in threshold: continue
                    g='high' if load >= threshold[e['s']] else 'other'
                else: g=group(load,cap)
                v=e['B']-e['base']; acc=daily[g][e['d']]; acc[0]+=1; acc[1]+=v
                if not control: cells[cell(e)].append((g=='high',v))
            key=f'{t}_{cap}_{"control" if control else "main"}'
            results[key]={g:stats(ds) for g,ds in daily.items()}
            if not control: perm_cells[key]=cells
save('s3-s4-groups.json',results)
# Conditional permutation of high labels within baseline cells.
permutations={}
for key,cells in perm_cells.items():
    observed=sum(v for vals in cells.values() for high,v in vals if high)
    n=sum(high for vals in cells.values() for high,v in vals)
    if not n: permutations[key]=None; continue
    ge=0
    prepared=[([v for _,v in vals],sum(h for h,_ in vals)) for vals in cells.values()]
    for _ in range(1000):
        total=0.0
        for vals,k in prepared:
            if k == len(vals): total+=sum(vals)
            elif k: total+=sum(rng.sample(vals,k))
        ge += total >= observed-1e-10
    permutations[key]={'n':n,'observed_mean':observed/n,'p_one_sided_positive':(ge+1)/1001}
save('s4-permutation.json',permutations)
annual={}
for cap in (38,43,'top10'):
    count=sum(1 for e in rows[2025] if (e['s'] in threshold and e['L'] >= threshold[e['s']]) if cap=='top10') if cap=='top10' else sum(e['L'] >= cap-5 for e in rows[2025])
    for t in (30,60,90):
        stat=results[f'{t}_{cap}_main'].get('high')
        annual[f'{t}_{cap}']={'high_arrivals':count,'annualized': [count*x for x in (stat['ci'][0],stat['bootstrap_median'],stat['ci'][1])] if stat else None}
save('s5-annual.json',annual)
