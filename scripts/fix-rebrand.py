#!/usr/bin/env python3
"""Finish HSK Prep rebrand: fix footers, emails, duplicate logo text."""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'.git', 'node_modules', 'scripts'}

REPLACEMENTS = [
    (r'<a href="mailto:info@mandarinzone\.com" class="btn btn-ghost">info@mandarinzone\.com</a>',
     '<a href="https://github.com/Make-dream-clear/hsk4-mock-exam" target="_blank" rel="noopener" class="btn btn-ghost">GitHub</a>'),
    (r'<a href="/guide/" target="_blank" rel="noopener" class="btn btn-ghost">Contact Us</a>\s*',
     ''),
    (r'<a href="/" target="_blank" rel="noopener" class="btn btn-ghost">Visit Website</a>\s*',
     '<a href="/exams/" class="btn btn-ghost">Mock Exams</a>\n      '),
    (r'class="footer-logo" loading="lazy">',
     'class="footer-logo" loading="lazy" src="/logo.svg">'),
    (r'src="/logo-light\.svg" alt="HSK Prep" class="footer-logo"',
     'src="/logo.svg" alt="HSK Prep" class="footer-logo"'),
    (r'(<img src="/logo-light\.svg" alt="HSK Prep" class="logo-mark"[^>]*>)\s*<div class="logo-text">HSK <span>Prep</span></div>',
     r'\1'),
    (r'"source": "HSK Prep \(mandarinzone\.com\)"',
     '"source": "HSK Prep"'),
    (r'"source": "Mandarin Zone \(mandarinzone\.com\)"',
     '"source": "HSK Prep"'),
    (r'By HSK Prep Beijing',
     'By HSK Prep'),
    (r'HSK Prep in Beijing',
     'HSK Prep'),
    (r'<strong>Want a teacher\?</strong> — <a href="/"[^>]*>HSK Prep</a> offers 1-on-1 online and in-person classes in Beijing\.',
     '<strong>100% free</strong> — no account, no subscription. Open source under CC BY-NC-SA 4.0.'),
]

def process_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
    except (UnicodeDecodeError, IsADirectoryError):
        return False
    orig = text
    for pattern, repl in REPLACEMENTS:
        text = re.sub(pattern, repl, text)
    if text != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        return True
    return False

count = 0
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP]
    for name in filenames:
        if not name.endswith(('.html', '.js', '.md', '.json', '.css', '.xml')) and name not in ('LICENSE', 'PROMO.md'):
            continue
        if process_file(os.path.join(dirpath, name)):
            count += 1

print(f'Updated {count} files')
