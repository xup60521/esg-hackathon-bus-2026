# 舊版，預設路徑為開發副本，不作交付重跑指令。
#!/usr/bin/env python3
"""6670 exposure and illustrative decision thresholds; database is read-only."""
import collections, datetime, itertools, math, random, sqlite3, sys
from pathlib import Path

DB = '/tmp/claude-1000/-home-zup-code-esg-hackathon-bus-2026/e3280782-e84b-4051-8849-189e12c5a845/scratchpad/trips.db'
db = sqlite3.connect(Path(sys.argv[1] if len(sys.argv) > 1 else DB).resolve().as_uri() + '?mode=ro', uri=True)
q = '''select id,vehicle,board_date,board_ts,alight_ts,board_stop,coalesce(ticket_type,'') from trips
where vehicle is not null and board_ts is not null and alight_ts is not null
and board_stop != alight_stop and alight_ts-board_ts between 180 and 14400 order by vehicle,board_date'''
counts = collections.Counter()
ends = ('臺中', '高鐵臺中站', '日月潭', '台中航空站')
for (_, date), group in itertools.groupby(db.execute(q), key=lambda r: (r[1], r[2])):
    rows = list(group); active = {}; hit = set(); low = set(); rising = False
    events = sorted((t, kind, r[0], r) for r in rows for t, kind in ((r[3], 1), (r[4], 0)))
    for _, kind, ident, row in events:
        if not kind:
            if rising and 41 <= len(active) <= 43: hit.update(active)
            rising = False
            active.pop(ident, None)
        else:
            if len(active) >= 38: low.add(ident)
            active[ident] = row; rising = True
    day = datetime.date.fromisoformat(date).weekday()
    for row in rows:
        groups = ['全線']
        if row[5] not in ends:
            groups.append('中途站')
            for label, words in [('敬老', ('敬老',)), ('愛心等', ('愛心','博愛','陪伴')), ('學生', ('學生',))]:
                if any(w in row[6] for w in words): groups.append(label)
        for g in groups:
            counts[g, '全部'] += 1
            if row[0] in hit: counts[g, '高負載'] += 1
            if row[0] in low and day in (4, 6): counts[g, '週五日座位不多'] += 1

dates = collections.Counter(datetime.date.fromisoformat(x[0]).weekday() for x in db.execute('select distinct board_date from trips') if x[0])
for g in ('全線','中途站','敬老','愛心等','學生'):
    n, h = counts[g,'全部'], counts[g,'高負載']
    print(g, '有效旅次', n, '高負載旅次', h, '風險', round(h/n, 5), '相對中途全體', round((h/n)/(counts['中途站','高負載']/counts['中途站','全部']), 3))
for g in ('中途站','全線'):
    # Both weekdays have equal number of observed dates in this dataset; calculate separately nonetheless.
    # Recount per weekday in the same pass would be redundant: combined / 104 * 52 when dates equal.
    assert dates[4] == dates[6]
    print(g, '週五日年化暴露', round(counts[g,'週五日座位不多'] * 52 / dates[4], 1))

# Assumed illustrative windows: 104 annually; independent scenarios per window.
rng = random.Random(6670); results = []
for _ in range(10000):
    runs = rng.choice((0, 1, 2)); threshold = rng.choice((15, 20, 25)); no_show = rng.choice((0, .1, .2))
    actual = runs * round(threshold * (1-no_show))
    car_share = rng.uniform(0, 1); original_bus_share = rng.uniform(0, 1-car_share)
    # All parameters below are assumptions, not fitted distributions.
    service_km, deadhead_km, passenger_km = 60, 20, 30
    factor = rng.uniform(.90, 1.23)
    avoided = actual * original_bus_share  # upper bound: each such passenger frees one useful seat
    saved = actual * car_share * passenger_km * .104
    emitted = runs * (service_km + deadhead_km) * factor
    results.append((runs, actual, car_share, avoided, emitted-saved))
def pct(values, p):
    a = sorted(values); return a[int((len(a)-1)*p)]
for i, name in [(0,'成班數'),(1,'實到'),(2,'自用車占比'),(3,'避免被留下上限'),(4,'淨增排 kg')]:
    print(name, 'P10/P50/P90', *(round(pct([x[i] for x in results], p), 2) for p in (.1,.5,.9)))
print('每班碳門檻乘客', *(round((80*f)/(30*.104),2) for f in (.90,1.23)))
print('每避免事件最高車公里，假設每事件減少30人公里', *(round(30*.104/f,2) for f in (1.23,.90)))
