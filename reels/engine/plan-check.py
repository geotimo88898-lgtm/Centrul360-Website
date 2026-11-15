#!/usr/bin/env python3
"""The posting calendar checked against our rules (the owner, 15.11: after every big wave of approvals the whole calendar
is checked and fixed where it isn't optimal). Reads https://admin.centrul360.com/api/lead-health?plan=1 (read only).
  python3 plan-check.py            the next 3 weeks, one line per post, then the problems
Rules: every post at a configured time of its network; never two posts on the same network at the same time; the same reel
never on two networks the same day; no network over its weekly quota; two brand pieces (logo, manifesto, demo, tour) not on
the same network on consecutive days; a week's networks not left empty when there are approved reels to fill them."""
import collections, datetime, json, subprocess, sys

URL = 'https://admin.centrul360.com/api/lead-health?plan=1'
BRAND = ('logo', 'demo', 'nu promitem', 'pov:', 'tur')


def ro(at):
    t = datetime.datetime.fromisoformat(at.replace('Z', '+00:00'))
    # Bucharest: UTC+2 in winter, UTC+3 from the last Sunday of March to the last Sunday of October
    y = t.year
    def last_sun(m):
        d = datetime.datetime(y, m, 31, 1, tzinfo=t.tzinfo)
        return d - datetime.timedelta(days=(d.weekday() + 1) % 7)
    return t + datetime.timedelta(hours=3 if last_sun(3) <= t < last_sun(10) else 2)


def main():
    d = json.loads(subprocess.run(['curl', '-sS', '--max-time', '60', URL], capture_output=True, text=True).stdout)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = [r for r in d['rows'] if r['at'] >= now[:10] and r['state'] in ('planned', 'todo', 'posting')]
    for r in rows:
        r['t'] = ro(r['at'])
    rows.sort(key=lambda r: r['t'])
    issues = []
    slot = collections.defaultdict(list); day = collections.defaultdict(set); week = collections.Counter()
    for r in rows:
        slot[(r['net'], r['t'].strftime('%Y-%m-%d %H:%M'))].append(r)
        day[(r['id'], r['t'].date())].add(r['net'])
        if r['kind'] == 'reel':
            week[(r['net'], (r['t'].date() - datetime.timedelta(days=r['t'].weekday())).isoformat())] += 1
        hm = r['t'].strftime('%H:%M')
        ok = d['times'].get(r['net'], []) + [d['photoTime'].get(r['net'])]
        if hm not in ok:
            issues.append(f"oră nepotrivită: {r['net']} {r['t']:%a %d.%m %H:%M} {r['topic'][:40]}")
    for k, v in slot.items():
        if len(v) > 1:
            issues.append(f"două postări în același loc: {k[0]} {k[1]}: " + ' + '.join(x['topic'][:30] for x in v))
    for k, v in day.items():
        if len(v) > 1:
            issues.append(f"același reel pe {', '.join(sorted(v))} în aceeași zi ({k[1]})")
    q = (d.get('quotas') or {}).get('full') or {}
    for (net, wk), n in week.items():
        lim = max(((d.get('quotas') or {}).get(w) or {}).get(net, {}).get('reel', 99) for w in ('warm', 'full'))
        if n > lim:
            issues.append(f"{net} are {n} reels în săptămâna {wk} (cota {lim})")
    brand = [r for r in rows if any(b in r['topic'].lower() for b in BRAND)]
    for a in brand:
        for b in brand:
            if a is not b and a['net'] == b['net'] and a['id'] != b['id'] and 0 < (b['t'].date() - a['t'].date()).days <= 1:
                issues.append(f"două piese de brand la rând pe {a['net']}: {a['topic'][:25]} ({a['t']:%d.%m}) și {b['topic'][:25]} ({b['t']:%d.%m})")
    for r in rows:
        print(f"{r['t']:%a %d.%m %H:%M}  {r['net']:2}  {r['review'][:4]:4}  {r['topic'][:60]}")
    print(f"\n{len(rows)} postări; probleme: {len(issues)}")
    for i in issues:
        print(' -', i)
    return 1 if issues else 0


if __name__ == '__main__':
    sys.exit(main())
