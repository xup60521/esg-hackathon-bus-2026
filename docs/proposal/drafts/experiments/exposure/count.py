#!/usr/bin/env python3
"""Count preconstructed spillover arrival events; never modify input or overwrite output."""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('arrivals', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
endpoints = {'臺中', '高鐵臺中站', '日月潭', '台中航空站'}
stations = ['九族文化村', '桃米坑', '暨南大學', '崎下']
counts = Counter()
with args.arrivals.open(encoding='utf-8') as source:
    for line in source:
        event = json.loads(line)
        year = event['d'][:4]
        if year not in ('2024', '2025') or event['B'] <= 0:
            continue
        if event['s'] not in endpoints:
            counts[year, '中途站合計'] += 1
        if event['s'] in stations:
            counts[year, event['s']] += 1
with args.output.open('x', encoding='utf-8', newline='') as output:
    writer = csv.writer(output)
    writer.writerow(['站別', '2024', '2025', '兩年合計', '年化（兩年平均）'])
    for station in ['中途站合計', *stations]:
        a, b = counts['2024', station], counts['2025', station]
        writer.writerow([station, a, b, a + b, (a + b) / 2])
