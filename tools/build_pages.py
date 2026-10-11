#!/usr/bin/env python3
"""One-off converter: design-prototype/*.html  ->  server/pages/*.html

Keeps each prototype page's body markup and page-specific <style>, drops the demo-data script and
inline shared CSS, and links the real shared files (public/assets/*) instead. Page logic lives in
public/assets/pages/<name>.js. Run from the repo root:  python3 -I tools/build_pages.py
"""
import re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'design-prototype')
OUT = os.path.join(ROOT, 'server', 'pages')

ROUTES = {
    'customer/index.html': '/', 'index.html': '/', '01-session.html': '/book/session', '02-date.html': '/book/date', '03-group.html': '/book/group',
    '04-pickup-extras.html': '/book/pickup', '05-checkout.html': '/book/checkout', 'my-booking.html': '/booking', '../vendor/register.html': '/partners/apply',
    '../customer/index.html': '/', 'private.html': '/admin/bookings', 'shared.html': '/admin/shared',
}

# page -> (kind, script modules, extra head, replacements)
PAGES = {
    'customer/index.html': ('customer', [], '', []),
    'customer/01-session.html': ('customer', [], '', []),
    'customer/02-date.html': ('customer', [], '', []),
    'customer/03-group.html': ('customer', [], '', []),
    'customer/04-pickup-extras.html': ('customer', ['/vendor/leaflet/leaflet.js'], '<link rel="stylesheet" href="/vendor/leaflet/leaflet.css">', []),
    'customer/05-checkout.html': ('customer', [], '', []),
    'customer/06-confirmation.html': ('customer', ['/assets/qr.js'], '', []),
    'customer/ticket.html': ('customer', ['/assets/qr.js'], '', []),
    'customer/my-booking.html': ('customer', [], '', []),
    'shared/trip.html': ('customer', [], '<link rel="stylesheet" href="/assets/shared-seats.css">', []),
    'vendor/register.html': ('customer', [], '', []),
    'vendor/portal.html': ('partner', ['/assets/qr.js', '/vendor/jsQR.js'], '', []),
    'admin/login.html': ('adminlogin', [], '', []),
    'admin/dashboard.html': ('admin', ['/assets/qr.js'], '', []),
    'admin/private.html': ('admin', ['/assets/qr.js'], '', []),
    'admin/shared.html': ('admin', ['/assets/qr.js'], '', []),
    'admin/payments.html': ('admin', [], '', []),
    'admin/vendors.html': ('admin', [], '', []),
    'admin/checkin.html': ('admin', ['/vendor/jsQR.js'], '', []),
    'admin/settings.html': ('admin', ['/vendor/leaflet/leaflet.js'], '<link rel="stylesheet" href="/vendor/leaflet/leaflet.css">', []),
}

# Wording that was prototype-only, or that must now come from Settings.
TEXT = {
    'customer/index.html': [
        ('Price is for the whole jeep, up to 6 people.', 'Price is for the whole jeep, up to <span data-cfg="maxPerJeep">6</span> people.'),
        ('Free within 7 km of Tissamaharama. We come to your door.', 'Free within <span data-cfg="radiusKm">7</span> km of our base. We come to your door.'),
        ('Pay a 30% deposit and get your QR ticket by email straight away.', 'Pay a <span data-cfg="depositPct">30</span>% deposit and get your QR ticket by email straight away.'),
        ('Pay a 30% deposit online to confirm instantly, pay in full, or pay at pickup (we confirm by email first).', 'Pay a <span data-cfg="depositPct">30</span>% deposit online to confirm instantly, pay in full, or pay at pickup (we confirm by email first).'),
        ('Free cancellation up to 48 hours before. 50% back between 48 and 24 hours. No refund inside 24 hours. (Placeholder policy.)', '<span id="policyText"></span>'),
        ('Placeholder: confirm with the company whether park entry is included.', 'Park entry fees depend on the day and the size of your group. Message us and we will confirm exactly what is included in your price.'),
        (' · Prototype with placeholder prices', ''),
        ('Yala Wild Safaris · <a href', '<span data-cfg="brand">Yala Wild Safaris</span> · <a href'),
    ],
    'customer/02-date.html': [
        ('Green bars = jeeps free. Hatched days are closed or sold out. Availability comes from the admin\'s fleet and closed dates.', 'Green bars = jeeps free. Hatched days are closed or sold out.'),
    ],
    'customer/04-pickup-extras.html': [
        ('Free within 7 km of our base.', 'Free within <span data-cfg="radiusKm">7</span> km of our base.'),
        ('<p class="tiny muted" style="margin-top:6px">The real version uses Google Maps. The pickup radius is checked against each safari\'s base.</p>', '<p class="tiny muted" style="margin-top:6px">Tap the map to drop the pin. The distance from our base is checked when you book.</p>'),
    ],
    'customer/05-checkout.html': [
        ('I agree to the cancellation policy: free up to 48h before, 50% back between 48h and 24h, none inside 24h. <span class="muted">(Placeholder policy)</span>', 'I agree to the cancellation policy: <span id="termsText"></span>'),
    ],
    'customer/06-confirmation.html': [
        ('<p class="tiny muted" style="margin:8px 0 0">Prototype: <a href="../emails/index.html">see every email template</a>.</p>', ''),
        ('<h3 style="margin-bottom:6px">Emails sent just now</h3>', '<h3 style="margin-bottom:6px">What happens next</h3>'),
    ],
    'admin/dashboard.html': [
        ('<button class="btn sm" id="sim">Simulate a driver scan</button>', ''),
        ('<span class="small muted">Demo numbers</span>', '<span class="small muted">card, cash and bank</span>'),
    ],
    'admin/login.html': [
        (' value="admin@yalawildsafaris.lk"', ''), (' value="demo-password"', ''),
        ('<a href="#" onclick="toast(\'A reset link would be emailed.\');return false">Forgot password?</a> · Prototype: any values work', 'Forgot your password? Ask the owner to reset it in Settings → Team.'),
    ],
    'admin/checkin.html': [
        ('<span class="small" style="position:absolute;bottom:12px">Camera preview (real build uses the device camera)</span>', '<span class="small" style="position:absolute;bottom:12px" id="camNote">Tap “Use camera” to scan a QR</span>'),
        ('<div class="small muted" style="margin-top:10px">Try:</div><div class="chips" id="chips"></div>', '<div style="margin-top:10px"><button class="btn sm" type="button" id="camBtn">📷 Use camera</button></div>'),
    ],
}

REGEX = {
    'customer/04-pickup-extras.html': [
        (r'<div class="map" id="map".*?<span class="hint" id="hint">.*?</span>\s*</div>',
         '<div class="lmap" id="map" role="application" aria-label="Map: tap to drop a pin on your hotel"></div>\n      <div style="margin-top:8px"><button class="btn sm" type="button" id="locate">📍 Use my location</button></div>'),
    ],
    'customer/05-checkout.html': [
        (r'<div class="card cardbox" id="cardBox">.*?</div>\s*(?=<label class="chk)',
         '<div class="card cardbox" id="cardBox"><div class="field" id="provBox" style="display:none"><label>Pay with</label><div class="grid" id="provOpts" style="gap:8px"></div></div>'
         '<p class="small muted" style="margin:0">🔒 When you tap the button you will pay on a secure page run by <b id="provName">our payment partner</b>. Your card details never touch our website, and the amount is set by the server, not by your browser.</p></div>\n    <div class="note bad" id="subErr" style="display:none;margin-top:12px"></div>\n    '),
    ],
}

def head_for(kind, title, extra_head, page):
    manifest = {'customer': '/manifest.webmanifest', 'admin': '/admin.webmanifest', 'adminlogin': '/admin.webmanifest', 'partner': '/partner.webmanifest'}[kind]
    theme = '#c0682a' if kind in ('customer', 'partner') else '#2b2118'
    css = 'customer.css' if kind == 'customer' else 'admin.css'
    app_title = {'customer': 'Yala Safaris', 'admin': 'Yala Admin', 'adminlogin': 'Yala Admin', 'partner': 'Yala Partner'}[kind]
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="theme-color" content="{theme}">
<link rel="manifest" href="{manifest}">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="{app_title}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap"></noscript>
<link rel="stylesheet" href="/assets/{css}">
<link rel="stylesheet" href="/assets/pwa.css">
{extra_head}'''

def convert(page):
    kind, libs, extra_head, _ = PAGES[page]
    s = open(os.path.join(SRC, page), encoding='utf-8').read()
    title = re.search(r'<title>(.*?)</title>', s, re.S).group(1)
    styles = re.findall(r'<style>(.*?)</style>', s, re.S)
    page_style = styles[1] if len(styles) > 1 else ''
    # body markup: from after <body...> to the first <script>
    body_open = re.search(r'<body[^>]*>', s)
    after = s[body_open.end():]
    # the prototype puts the style block 2 inside the body for some pages; strip all style/script
    after = re.sub(r'<style>.*?</style>', '', after, flags=re.S)
    after = re.sub(r'<script>.*?</script>', '', after, flags=re.S)
    after = re.sub(r'</body>\s*</html>\s*$', '', after).strip('\n')
    for old, new in TEXT.get(page, []):
        if old not in after:
            print(f'  ! {page}: text not found: {old[:60]!r}', file=sys.stderr)
        after = after.replace(old, new)
    for pat, new in REGEX.get(page, []):
        after, n = re.subn(pat, new, after, flags=re.S)
        if not n: print(f'  ! {page}: regex not matched: {pat[:50]!r}', file=sys.stderr)
    # links between pages
    def fix(m):
        attr, url = m.group(1), m.group(2)
        base = url.split('?')[0]; qs = url[len(base):]
        return f'{attr}="{ROUTES[base] + qs}"' if base in ROUTES else m.group(0)
    after = re.sub(r'(href)="([^"#][^"]*)"', fix, after)

    scripts = []
    if kind == 'admin': scripts.append('/api/admin/data.js')
    elif kind in ('customer', 'partner', 'adminlogin'): scripts.append('/api/config.js')
    scripts.append('/assets/core.js')
    scripts.append('/assets/customer.js' if kind == 'customer' else '/assets/admin.js' if kind != 'adminlogin' else None)
    scripts += libs
    name = os.path.basename(page)[:-5]
    prefix = {'customer': '', 'admin': 'admin-', 'adminlogin': 'admin-', 'partner': 'partner-'}[kind]
    if page.startswith('shared/'): prefix = 'shared-'
    if page.startswith('vendor/register'): prefix = 'partner-'
    scripts.append(f'/assets/pages/{prefix}{name}.js')
    scripts = [x for x in scripts if x]
    out = head_for(kind, title, extra_head, page)
    if page_style.strip(): out += f'<style>{page_style}</style>\n'
    out += '</head>\n<body>\n' + after + '\n\n' + '\n'.join(f'<script defer src="{x}"></script>' for x in scripts) + '\n</body>\n</html>\n'
    dest_name = page
    os.makedirs(os.path.join(OUT, os.path.dirname(dest_name)), exist_ok=True)
    open(os.path.join(OUT, dest_name), 'w', encoding='utf-8').write(out)
    return f'{prefix}{name}.js'

if __name__ == '__main__':
    names = []
    for p in PAGES:
        names.append(convert(p))
    print('\n'.join(names))
