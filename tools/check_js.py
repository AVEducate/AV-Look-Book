#!/usr/bin/env python3
"""Post-edit check for deploy/lookbook_builder.html. Run after EVERY edit to the page:

    python3 tools/check_js.py [path-to-another-copy-of-the-page]

It extracts each inline <script> block, runs `node --check` on it, counts braces and parens, looks for duplicate
top-level function names beyond the known harmless set, and prints the build stamp. Exit code 1 on a syntax error,
a brace mismatch or a new duplicate. The paren count is informational: the page has string literals with unbalanced
parens by design (a delta of about -16 inside the big block is normal).
Reading receipt: BRACES-BALANCED (report after reading this file).
"""
import re, subprocess, collections, sys, os, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'deploy', 'lookbook_builder.html')   # an optional path checks a scratch copy (it used to be ignored silently)
KNOWN_DUPS = set('_c close esc esc2 find mv newPage nl pillStyle place union up'.split())

s = open(PAGE, encoding='utf-8').read()
blocks = []; i = 0
while True:
    a = s.find('<script', i)
    if a < 0: break
    e = s.find('>', a); tag = s[a:e]
    b = s.find('</script>', e)
    if 'src=' not in tag: blocks.append(s[e + 1:b])
    i = b + 9
print('script blocks', len(blocks))
bad = False
tmp = tempfile.gettempdir()
for n, b in enumerate(blocks):
    p = os.path.join(tmp, 'lb_check_%d.js' % n)
    open(p, 'w', encoding='utf-8').write(b)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True, timeout=120)
    ok = r.returncode == 0
    print('block', n, len(b), 'node --check:', 'ok' if ok else r.stderr[:700])
    print('  braces', b.count('{'), b.count('}'), 'parens', b.count('('), b.count(')'))
    if not ok or b.count('{') != b.count('}'): bad = True
big = max(blocks, key=len)
names = re.findall(r'^function\s+([A-Za-z_$][\w$]*)\s*\(', big, re.M)
dups = [n for n, c in collections.Counter(names).items() if c > 1 and n not in KNOWN_DUPS]
print('dups beyond known:', dups)
if dups: bad = True
print('stamp:', re.findall(r'build 2026-06-16[a-z][a-z0-9]', s))
sys.exit(1 if bad else 0)
