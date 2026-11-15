/* Language switch for the partner pages (drivers, trackers, meal suppliers): English, සිංහල, தமிழ்.
   The pages are written in plain English. This file swaps the words for the chosen language on screen.
   Anything without a translation stays in English, so nothing breaks. Phrases marked "review" should be checked by a native speaker. */
(function () {
  const LANGS = [['en', 'EN'], ['si', 'සිං'], ['ta', 'தமிழ்']];
  let lang = 'en';
  try { lang = localStorage.getItem('lang') || (/^si/i.test(navigator.language) ? 'si' : /^ta/i.test(navigator.language) ? 'ta' : 'en') } catch (e) { }
  if (!LANGS.some(l => l[0] === lang)) lang = 'en';

  // English text -> [Sinhala, Tamil]. No full stop at the end: punctuation is kept as it is on the page.
  const D = {
    /* menu */
    'Home': ['මුල් පිටුව', 'முகப்பு'], 'My jobs': ['මගේ රැකියා', 'என் வேலைகள்'], 'Meal orders': ['ආහාර ඇණවුම්', 'உணவு ஆர்டர்கள்'], 'Scan tickets': ['ටිකට් ස්කෑන් කරන්න', 'டிக்கெட் ஸ்கேன்'],
    'Payments': ['ගෙවීම්', 'பணம்'], 'Calendar': ['දින දර්ශනය', 'நாட்காட்டி'], 'Profile': ['මගේ තොරතුරු', 'என் விவரங்கள்'], 'Partner portal': ['හවුල්කරු පිටුව', 'பங்குதாரர் பக்கம்'],
    /* login */
    'Partner login': ['ඇතුල් වන්න', 'உள்நுழைய'], 'Email': ['ඊමේල්', 'மின்னஞ்சல்'], 'Password': ['මුරපදය', 'கடவுச்சொல்'], 'Log in': ['ඇතුල් වන්න', 'உள்நுழை'],
    'Email me a login link instead': ['ඒ වෙනුවට ඊමේල් ලින්ක් එකක් එවන්න', 'பதிலாக மின்னஞ்சலில் லிங்க் அனுப்பு'], 'Type your email first': ['මුලින් ඔබේ ඊමේල් එක ලියන්න', 'முதலில் உங்கள் மின்னஞ்சலை எழுதுங்கள்'],
    'Not a partner yet?': ['තවම හවුල්කරුවෙක් නොවේද?', 'இன்னும் பங்குதாரர் இல்லையா?'], 'Apply here': ['මෙතැනින් අයදුම් කරන්න', 'இங்கே விண்ணப்பிக்கவும்'],
    /* home */
    'Next job': ['ඊළඟ රැකියාව', 'அடுத்த வேலை'], 'Jobs this week': ['මේ සතියේ රැකියා', 'இந்த வாரம் வேலைகள்'], 'Money waiting for you': ['ඔබට ලැබිය යුතු මුදල', 'உங்களுக்கு வர வேண்டிய பணம்'],
    'See payments →': ['ගෙවීම් බලන්න →', 'பணம் பார்க்க →'], 'Rating': ['ඇගයීම', 'மதிப்பீடு'], 'Coming up': ['ඉදිරියට ඇති', 'வரவிருப்பவை'], 'See all jobs': ['සියලු රැකියා බලන්න', 'எல்லா வேலைகளும்'],
    'No jobs yet': ['තවම රැකියා නැත', 'இன்னும் வேலைகள் இல்லை'], 'No jobs yet. The office will email you when a job is offered': ['තවම රැකියා නැත. රැකියාවක් ලැබුණු විට කාර්යාලය ඊමේල් කරයි', 'இன்னும் வேலை இல்லை. வேலை வந்தால் அலுவலகம் மின்னஞ்சல் அனுப்பும்'],
    'Your account is paused, so you will not get new job offers. Contact the office to start again': ['ඔබේ ගිණුම නවතා ඇත. නැවත පටන් ගැනීමට කාර්යාලයට කතා කරන්න', 'உங்கள் கணக்கு நிறுத்தப்பட்டுள்ளது. மீண்டும் தொடங்க அலுவலகத்தை அழைக்கவும்'],
    /* job card */
    'New job for you': ['ඔබට අලුත් රැකියාවක්', 'உங்களுக்கு புதிய வேலை'], 'Shared jeep': ['පොදු ජීප් රථය', 'பகிர்ந்த ஜீப்'], 'Private jeep': ['පෞද්ගලික ජීප් රථය', 'தனிப்பட்ட ஜீப்'], 'Pickup': ['ගන්නා වේලාව', 'அழைத்துச் செல்லும் நேரம்'],
    'several hotels': ['හෝටල් කිහිපයක්', 'பல ஹோட்டல்கள்'], 'Office': ['කාර්යාලය', 'அலுவலகம்'], 'Guests': ['අමුත්තන්', 'விருந்தினர்கள்'], 'Money to take from guest': ['අමුත්තාගෙන් ගත යුතු මුදල', 'விருந்தினரிடம் வாங்க வேண்டிய பணம்'],
    'Nothing': ['කිසිවක් නැත', 'ஒன்றும் இல்லை'], 'You will get': ['ඔබට ලැබෙන්නේ', 'உங்களுக்கு கிடைப்பது'], 'Meal packs': ['ආහාර පැකට්', 'உணவு பொட்டலங்கள்'], 'Deliver to': ['ගෙන යා යුතු තැන', 'கொண்டு செல்ல வேண்டிய இடம்'],
    'Our office · before': ['අපේ කාර්යාලය · පෙර', 'எங்கள் அலுவலகம் · முன்'], 'Your payment': ['ඔබේ ගෙවීම', 'உங்கள் பணம்'], 'What to prepare': ['සකස් කළ යුතු දේ', 'தயார் செய்ய வேண்டியவை'],
    'Accept job': ['රැකියාව භාර ගන්න', 'வேலையை ஏற்கவும்'], 'Decline': ['ප්‍රතික්ෂේප කරන්න', 'மறுக்கவும்'], 'Trip is done': ['සංචාරය අවසන්', 'பயணம் முடிந்தது'], 'Scan ticket to start trip': ['ටිකට් ස්කෑන් කර සංචාරය පටන් ගන්න', 'டிக்கெட்டை ஸ்கேன் செய்து பயணத்தை தொடங்கு'],
    'Directions': ['මාර්ගය', 'வழி'], 'Add to calendar': ['දින දර්ශනයට දාන්න', 'நாட்காட்டியில் சேர்'], 'Pick up guests': ['අමුත්තන් ඇතුල් කරගන්න', 'விருந்தினர்களை ஏற்றுங்கள்'], 'Give job to someone else': ['රැකියාව වෙන කෙනෙකුට දෙන්න', 'வேலையை வேறொருவருக்கு கொடுங்கள்'],
    'Call': ['අමතන්න', 'அழை'], 'No guests yet': ['තවම අමුත්තන් නැත', 'இன்னும் விருந்தினர்கள் இல்லை'], 'not paid': ['ගෙවා නැත', 'பணம் கொடுக்கவில்லை'],
    'Job accepted · it is on your calendar now': ['රැකියාව භාර ගත්තා', 'வேலை ஏற்கப்பட்டது'], 'Job declined · it goes to the next partner': ['රැකියාව ප්‍රතික්ෂේප කළා', 'வேலை மறுக்கப்பட்டது'], 'Trip finished · thank-you email sent to the guest': ['සංචාරය අවසන්. අමුත්තාට ස්තූති ඊමේල් එක යැවුවා', 'பயணம் முடிந்தது. விருந்தினருக்கு நன்றி மின்னஞ்சல் அனுப்பப்பட்டது'],
    /* scan */
    'Tap “Use camera” to scan': ['ස්කෑන් කිරීමට “කැමරාව” ඔබන්න', 'ஸ்கேன் செய்ய “கேமரா” அழுத்தவும்'], 'Use camera': ['කැමරාව භාවිතා කරන්න', 'கேமரா பயன்படுத்து'], 'Stop camera': ['කැමරාව නවතන්න', 'கேமராவை நிறுத்து'], 'Find': ['සොයන්න', 'தேடு'],
    'Or type the code': ['නැත්නම් කේතය ලියන්න', 'அல்லது குறியீட்டை எழுதுங்கள்'], 'Checking…': ['පරීක්ෂා කරමින්…', 'சரிபார்க்கிறது…'], 'Scan a ticket': ['ටිකට් එකක් ස්කෑන් කරන්න', 'டிக்கெட் ஸ்கேன் செய்'], 'Scan': ['ස්කෑන්', 'ஸ்கேன்'],
    'Point at the guest\'s QR code': ['අමුත්තාගේ QR කේතය දෙසට යොමු කරන්න', 'விருந்தினரின் QR குறியீட்டை நோக்கி காட்டுங்கள்'],
    /* pickup run */
    'Pickup run': ['අමුත්තන් ඇතුල් කරගැනීම', 'விருந்தினர்களை ஏற்றுதல்'], 'My jobs →': ['මගේ රැකියා', 'என் வேலைகள்'],
    'Pick up the guests': ['අමුත්තන් ඇතුල් කරගන්න', 'விருந்தினர்களை ஏற்றுங்கள்'], 'on board': ['ජීප් එකේ', 'ஜீப்பில்'], 'On board': ['ජීප් එකේ', 'ஜீப்பில்'], 'Driving there': ['එහෙට යමින්', 'அங்கே செல்கிறீர்கள்'], 'Waiting': ['බලා සිටී', 'காத்திருக்கிறார்'],
    'Closest to you': ['ඔබට ළඟම', 'உங்களுக்கு அருகில்'], 'Next closest': ['ඊළඟට ළඟම', 'அடுத்த அருகில்'], 'Next closest guest': ['ඊළඟට ළඟම අමුත්තා', 'அடுத்த அருகிலுள்ள விருந்தினர்'], 'Closest guest to you': ['ඔබට ළඟම අමුත්තා', 'உங்களுக்கு அருகிலுள்ள விருந்தினர்'],
    'Now driving to': ['දැන් යන්නේ', 'இப்போது செல்வது'], 'Go to': ['යන්න', 'செல்'], 'Go here': ['මෙතැනට යන්න', 'இங்கே செல்'], 'Meets at the office': ['කාර්යාලයේදී හමුවේ', 'அலுவலகத்தில் சந்திப்பார்'], 'person': ['කෙනා', 'நபர்'], 'people': ['දෙනා', 'நபர்கள்'], 'seat': ['ආසන', 'இருக்கை'],
    'from you': ['ඔබෙන්', 'உங்களிலிருந்து'], 'from the last stop': ['අන්තිම නැවතුමෙන්', 'கடைசி நிறுத்தத்திலிருந்து'], 'from the office': ['කාර්යාලයෙන්', 'அலுவலகத்திலிருந்து'],
    'Start the safari': ['සෆාරිය පටන් ගන්න', 'சஃபாரியை தொடங்கு'], 'The safari started at': ['සෆාරිය පටන් ගත්තේ', 'சஃபாரி தொடங்கிய நேரம்'], 'The guest knows you are coming': ['අමුත්තා දන්නවා ඔබ එනවා කියා', 'நீங்கள் வருவது விருந்தினருக்கு தெரியும்'],
    'Turn on your phone location so we can find the closest guest': ['ළඟම අමුත්තා සොයා ගැනීමට ඔබේ දුරකථන ස්ථානය (location) ඔන් කරන්න', 'அருகிலுள்ள விருந்தினரை கண்டுபிடிக்க உங்கள் தொலைபேசி இருப்பிடத்தை இயக்குங்கள்'],
    'The guest can see you coming on the map': ['අමුත්තාට සිතියමේ ඔබ එන ආකාරය පෙනේ', 'விருந்தினர் உங்களை வரைபடத்தில் பார்க்கலாம்'], 'Location is off. Please turn it on so we can find the closest guest': ['ස්ථානය (location) ඕෆ් කර ඇත. කරුණාකර ඔන් කරන්න', 'இருப்பிடம் அணைக்கப்பட்டுள்ளது. தயவுசெய்து இயக்கவும்'],
    /* money */
    'Owed to you': ['ඔබට ලැබිය යුතු', 'உங்களுக்கு வர வேண்டியது'], 'Paid to you (last 12 months)': ['ඔබට ගෙවූ (මාස 12)', 'உங்களுக்கு கொடுத்தது (12 மாதம்)'], 'Trips': ['සංචාර', 'பயணங்கள்'], 'Payouts received': ['ලැබුණු ගෙවීම්', 'பெற்ற பணம்'],
    'Date': ['දිනය', 'தேதி'], 'Trip': ['සංචාරය', 'பயணம்'], 'Role': ['කාර්යය', 'பணி'], 'Amount': ['මුදල', 'தொகை'], 'Status': ['තත්ත්වය', 'நிலை'], 'Paid': ['ගෙවා ඇත', 'கொடுக்கப்பட்டது'], 'Reference': ['යොමුව', 'குறிப்பு'], 'Method': ['ක්‍රමය', 'முறை'],
    'Nothing yet': ['තවම නැත', 'இன்னும் இல்லை'], 'No trips yet': ['තවම සංචාර නැත', 'இன்னும் பயணங்கள் இல்லை'], 'Download statement': ['ප්‍රකාශය බාගන්න', 'அறிக்கையை பதிவிறக்கு'],
    /* calendar / profile */
    'Days off': ['නිවාඩු දින', 'விடுமுறை நாட்கள்'], 'none': ['නැත', 'இல்லை'], 'Availability saved': ['සුරැකුවා', 'சேமிக்கப்பட்டது'], 'Mobile': ['දුරකථන', 'கைபேசி'], 'Bank': ['බැංකුව', 'வங்கி'], 'Branch': ['ශාඛාව', 'கிளை'], 'Save': ['සුරකින්න', 'சேமி'], 'Profile saved': ['සුරැකුවා', 'சேமிக்கப்பட்டது'],
    'Cancel': ['අවලංගු', 'ரத்து'], 'Close': ['වසන්න', 'மூடு'], 'Back': ['ආපසු', 'பின்'], 'Loading…': ['පූරණය වෙමින්…', 'ஏற்றுகிறது…'],
    /* hand over */
    'Hand over or change vehicle': ['රැකියාව භාරදෙන්න හෝ වාහනය වෙනස් කරන්න', 'வேலையை ஒப்படை அல்லது வாகனத்தை மாற்று'], 'Give the job to': ['රැකියාව දෙන්නේ', 'வேலையை கொடுப்பது'], 'Vehicle number plate': ['වාහන අංකය', 'வாகன எண்'], 'Create link': ['ලින්ක් එක සාදන්න', 'லிங்க் உருவாக்கு'],
    /* temporary driver page */
    'Get new jobs on your phone': ['අලුත් රැකියා දුරකථනයට ලබාගන්න', 'புதிய வேலைகளை தொலைபேசியில் பெறுங்கள்'], 'A notification pops up when the office offers you a job or hands one to you': ['කාර්යාලය රැකියාවක් දුන්විට දැනුම්දීමක් එයි', 'அலுவலகம் வேலை கொடுக்கும்போது அறிவிப்பு வரும்'],
    'Turn on notifications': ['දැනුම්දීම් ඔන් කරන්න', 'அறிவிப்புகளை இயக்கு'], 'Notifications are on': ['දැනුම්දීම් ඔන් කර ඇත', 'அறிவிப்புகள் இயக்கத்தில் உள்ளன'], 'Jeep + driver': ['ජීප් + රියදුරු', 'ஜீப் + ஓட்டுநர்'], 'Tracker / guide': ['ට්‍රැකර් / ගයිඩ්', 'டிராக்கர் / வழிகாட்டி'],
    'Trip finished. Thank you!': ['සංචාරය අවසන්. ස්තූතියි!', 'பயணம் முடிந்தது. நன்றி!'], 'Link not available': ['ලින්ක් එක වැඩ නොකරයි', 'லிங்க் கிடைக்கவில்லை'], 'Temporary driver': ['තාවකාලික රියදුරු', 'தற்காலிக ஓட்டுநர்'], 'Vehicle': ['වාහනය', 'வாகனம்'], 'Park': ['උද්‍යානය', 'பூங்கா'],
    'Trip finished': ['සංචාරය අවසන්', 'பயணம் முடிந்தது'], 'Call the office': ['කාර්යාලයට කතා කරන්න', 'அலுவலகத்தை அழைக்கவும்'],
    /* scan results */
    'Ready to board': ['ජීප් එකට ගන්න සූදානම්', 'ஏற ஏற்கத் தயார்'], 'Trip started': ['සංචාරය පටන් ගත්තා', 'பயணம் தொடங்கியது'], 'Already started': ['දැනටමත් පටන් ගෙන ඇත', 'ஏற்கனவே தொடங்கியது'], 'Already checked in': ['දැනටමත් ජීප් එකේ', 'ஏற்கனவே ஏறிவிட்டார்'], 'Not paid yet': ['තවම ගෙවා නැත', 'இன்னும் பணம் கொடுக்கவில்லை'],
    'Start the trip': ['සංචාරය පටන් ගන්න', 'பயணத்தை தொடங்கு'], 'Start anyway': ['කොහොමත් පටන් ගන්න', 'எப்படியும் தொடங்கு'],
  };
  const P = [ // starts-with phrases: English start -> [Sinhala, Tamil]
    ['Our office · before', ['අපේ කාර්යාලය · පෙර', 'எங்கள் அலுவலகம் · முன்']], ['Trip in progress since', ['සංචාරය පටන් ගත්තේ', 'பயணம் தொடங்கியது']], ['Temporary driver link', ['තාවකාලික රියදුරු ලින්ක්', 'தற்காலிக ஓட்டுநர் லிங்க்']],
  ];
  const core = s => { const m = s.match(/^([^\p{L}\p{N}]*)([\s\S]*?)([\s.:!?…]*)$/u); return m ? [m[1], m[2], m[3]] : ['', s, ''] };
  const SUB = [[/\bMorning\b/g, ['උදෑසන', 'காலை']], [/\bEvening\b/g, ['සවස', 'மாலை']], [/\bFull day\b/g, ['සම්පූර්ණ දවස', 'முழு நாள்']], [/\bseveral hotels\b/g, ['හෝටල් කිහිපයක්', 'பல ஹோட்டல்கள்']], [/\bJeep \+ driver\b/g, ['ජීප් + රියදුරු', 'ஜீப் + ஓட்டுநர்']], [/\b(\d+) people\b/g, ['$1 දෙනා', '$1 பேர்']], [/\b1 person\b/g, ['1 කෙනා', '1 நபர்']], [/\b(\d+) jeeps?\b/g, ['ජීප් $1', '$1 ஜீப்']], [/\bseats? (\d)/g, ['ආසන $1', 'இருக்கை $1']]];
  function tx(s) {
    if (lang === 'en' || !s) return s;
    const i = lang === 'si' ? 0 : 1, [a, c, z] = core(s), hit = D[c];
    if (hit) return a + hit[i] + z;
    for (const [k, v] of P) if (c.startsWith(k)) return a + v[i] + c.slice(k.length) + z;
    let r = s; SUB.forEach(([re, v]) => { r = r.replace(re, v[i]) }); return r;
  }
  function walk(n) {
    if (lang === 'en') return;
    if (n.nodeType === 3) { const t = n.nodeValue; if (t && t.trim()) { const r = tx(t.trim()); if (r !== t.trim()) n.nodeValue = t.replace(t.trim(), r) } return }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|CODE)$/.test(n.tagName)) return;
    for (const at of ['placeholder', 'title', 'aria-label']) { const v = n.getAttribute && n.getAttribute(at); if (v) { const r = tx(v); if (r !== v) n.setAttribute(at, r) } }
    n.childNodes.forEach(walk);
  }
  let busy = false;
  const obs = new MutationObserver(ms => {
    if (lang === 'en' || busy) return; busy = true;
    ms.forEach(m => { if (m.type === 'characterData') walk(m.target); else m.addedNodes.forEach(walk) });
    busy = false; sw();
  });
  function sw() {
    const cur = document.getElementById('langSw'), navr = document.querySelector('.navr');
    if (cur) { if (navr && cur.classList.contains('float')) { cur.classList.remove('float'); navr.insertBefore(cur, navr.firstChild) } return }
    const host = navr, el = document.createElement('div'); el.id = 'langSw'; el.className = 'langsw' + (host ? '' : ' float'); el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Language');
    el.innerHTML = LANGS.map(([k, l]) => `<button type="button" data-l="${k}" class="${k === lang ? 'on' : ''}" aria-pressed="${k === lang}">${l}</button>`).join('');
    el.onclick = e => { const b = e.target.closest('button'); if (!b) return; try { localStorage.setItem('lang', b.dataset.l) } catch (x) { } location.reload() };
    if (host) host.insertBefore(el, host.firstChild); else if (document.querySelector('#loginView .login, .brand, #content')) document.body.appendChild(el);
  }
  window.I18N = { t: s => tx(s), lang: () => lang, apply: walk };
  document.documentElement.lang = lang;
  const css = document.createElement('style');
  css.textContent = '.langsw{display:inline-flex;gap:2px;padding:3px;border-radius:99px;background:rgba(127,127,127,.18);margin-right:8px}.langsw button{border:0;background:transparent;color:inherit;font:700 12.5px system-ui,sans-serif;padding:6px 10px;border-radius:99px;min-height:32px}.langsw button.on{background:#c0682a;color:#fff}.langsw.float{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));right:10px;z-index:300;background:rgba(40,30,20,.85);color:#fff;margin:0}';
  document.head.appendChild(css);
  const start = () => { walk(document.body); sw(); obs.observe(document.body, { childList: true, subtree: true, characterData: true }) };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
