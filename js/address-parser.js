/* MoneyTracker — enhanced WhatsApp address recognition.
 * This wrapper normalizes address markers before the built-in parser runs.
 * Firebase is consulted first so known addresses keep their saved type.
 */
(() => {
  const normalize = value => String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const stripPhone = value => String(value || '')
    .replace(/(?<![0-9])(\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g, '')
    .replace(/(?<![0-9])\+77\d{9}/g, '')
    .replace(/(?<![0-9])87\d{9}/g, '')
    .replace(/(?<![0-9])77\d{9}/g, '')
    .replace(/,\s*$/, '')
    .trim();

  const isPhone = value => {
    const cleaned = String(value || '').trim().replace(/[\s\-\(\)]/g, '');
    return /^(\+7|8|7)\d{10}$/.test(cleaned) || /^\d{11}$/.test(cleaned);
  };

  function detectType(address) {
    const a = normalize(address);
    if (/гараж/i.test(a)) return 'other';
    if (/(?:^|[\s-])\d+\s*(?:пд?|под|подъ|подъезд)\b/i.test(a) ||
        /(?:^|[\s-])(?:пд?|под|подъ|подъезд)\s*\d+/i.test(a) ||
        /последн(?:ий|яя|ее)\s+подъезд/i.test(a)) return 'under';
    if (/(?:\d+\s*)кв\.?\b/i.test(a) || /\bквартир(?:а|у|е|ы)?\b/i.test(a)) return 'flat';
    const numeric = a.replace(/[^0-9-]/g, ' ').trim();
    if (/^\d+\s*-\s*\d+$/.test(numeric)) return 'under';
    if (/^\d+\s*-\s*\d+\s*-\s*\d+/.test(numeric)) return 'flat';
    return 'flat';
  }

  function typeFromSaved(value) {
    const t = normalize(value);
    if (t === 'under' || /подъезд|подъ|\bпд\b|\bпод\b/.test(t)) return 'under';
    if (t === 'flat' || /квартир|\bкв\b/.test(t)) return 'flat';
    if (t === 'other' || /гараж|бокс/.test(t)) return 'other';
    return null;
  }

  const cleanForMatch = value => normalize(value)
    .replace(/\bчерез\s+\d+\s*(?:мин|минут(?:у|ы)?)\b.*$/i, '')
    .replace(/[.,;:]+$/, '')
    .trim();

  async function readFirebaseAddresses() {
    const out = [];
    const { fbDB, fbMethods, fbUser } = window;
    if (!fbDB || !fbMethods || !fbUser?.uid || !fbMethods.getDocs) return out;

    const add = (addr, type, price = 0) => {
      if (!addr) return;
      const mapped = typeFromSaved(type) || detectType(addr);
      out.push({ addr: String(addr), type: mapped, price: Number(price) || 0 });
    };

    try {
      const snap = await fbMethods.getDocs(fbMethods.collection(fbDB, 'users', fbUser.uid, 'addresses'));
      snap.forEach(d => {
        const x = d.data() || {};
        add(x.addr || x.address || x.name, x.type || x.addrType, x.price);
      });
    } catch (e) {
      console.warn('Firebase address dictionary read skipped:', e);
    }

    try {
      const snap = await fbMethods.getDocs(fbMethods.collection(fbDB, 'users', fbUser.uid, 'settings'));
      snap.forEach(d => {
        const x = d.data() || {};
        for (const key of ['addresses', 'addressBook', 'customAddresses', 'waCustomAddrs']) {
          const list = x[key];
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            if (typeof item === 'string') add(item, detectType(item));
            else if (item) add(item.addr || item.address || item.name, item.type || item.addrType, item.price);
          }
        }
      });
    } catch (e) {
      console.warn('Settings address book read skipped:', e);
    }

    try {
      const snap = await fbMethods.getDocs(fbMethods.collection(fbDB, 'users', fbUser.uid, 'transactions'));
      const seen = new Set(out.map(x => cleanForMatch(x.addr)));
      snap.forEach(d => {
        const x = d.data() || {};
        const addr = x.address || x.comment;
        if (!addr) return;
        const key = cleanForMatch(addr);
        if (!key || seen.has(key)) return;
        const mapped = typeFromSaved(x.type) || detectType(addr);
        add(addr, mapped, x.price);
        seen.add(key);
      });
    } catch (e) {
      console.warn('Firebase transaction history read skipped:', e);
    }

    return out;
  }

  function findSaved(address, sources) {
    const raw = cleanForMatch(address);
    if (!raw) return null;
    for (const item of sources) {
      const known = cleanForMatch(item.addr || item.address);
      if (!known) continue;
      if (raw === known || raw.includes(known) || known.includes(raw)) return item;
    }
    return null;
  }

  function transformAddress(address, saved) {
    const type = saved?.type ? typeFromSaved(saved.type) : detectType(address);
    if (type === 'other') return address;

    const normalized = normalize(address);
    if (type === 'under') {
      const threeWithWord = normalized.match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*(?:пд?|под|подъ|подъезд)\b(.*)$/i);
      if (threeWithWord) return `${threeWithWord[1]}-${threeWithWord[2]}-${threeWithWord[3]}п${threeWithWord[4]}`;
      const three = normalized.match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)(.*)$/i);
      if (three && /(?:пд?|под|подъ|подъезд)/i.test(three[4])) return `${three[1]}-${three[2]}-${three[3]}п${three[4].replace(/(?:пд?|под|подъ|подъезд)/i, '')}`;
      const spacedThree = normalized.match(/^(\d+)\s*-\s*(\d+)\s+(\d+)\s*(?:пд?|под|подъ|подъезд)\b(.*)$/i);
      if (spacedThree) return `${spacedThree[1]}-${spacedThree[2]}-${spacedThree[3]}п${spacedThree[4]}`;
      const two = normalized.match(/^(\d+)\s*-\s*(\d+)(.*)$/i);
      if (two) return `${two[1]}-${two[2]}п${two[3]}`;
    }
    if (type === 'flat') {
      if (/\bквартир|\bкв\b/i.test(normalized)) return address;
      const three = normalized.match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)(.*)$/i);
      if (three) return `${three[1]}-${three[2]}-${three[3]}кв${three[4]}`;
    }
    return address;
  }

  async function install() {
    if (typeof window.parseWA !== 'function') return setTimeout(install, 50);
    const originalParseWA = window.parseWA;

    window.parseWA = async function enhancedParseWA() {
      const input = document.getElementById('waInput');
      if (!input) return originalParseWA();
      const originalText = input.value;
      if (!originalText.trim()) return originalParseWA();

      const firebaseAddresses = await readFirebaseAddresses();
      let localAddresses = [];
      try { localAddresses = JSON.parse(localStorage.getItem('waCustomAddrs') || '[]'); } catch (_) {}
      const sources = [...firebaseAddresses, ...localAddresses];
      const originalLocalAddresses = localStorage.getItem('waCustomAddrs');
      const temporaryGarageEntries = [];

      const blocks = originalText.split(/(\[\d+\.\d+,\s*\d+:\d+\])/);
      for (let i = 1; i < blocks.length; i += 2) {
        const body = blocks[i + 1] || '';
        const lines = body.split('\n');
        if (!lines.length) continue;

        const pointMatch = lines[0].match(/^(.*?(?:ALLEY\s*PUB|F\s*[123])\s*[:\-\s]+)(.*)$/i);
        if (pointMatch) {
          const address = stripPhone(pointMatch[2]).trim();
          if (address && !isPhone(address)) {
            const saved = findSaved(address, sources);
            const detected = saved?.type ? typeFromSaved(saved.type) : detectType(address);
            if (detected === 'other') temporaryGarageEntries.push({ addr: address, type: 'other', price: Number(saved?.price) || 0 });
            lines[0] = pointMatch[1] + transformAddress(address, saved);
          }
        }

        for (let j = 1; j < lines.length; j++) {
          const candidate = stripPhone(lines[j]).trim();
          if (!candidate || isPhone(candidate)) continue;
          if (/^(через|забрать|звонить|код|готов|не|да$|нет$)/i.test(candidate)) continue;
          const saved = findSaved(candidate, sources);
          const detected = saved?.type ? typeFromSaved(saved.type) : detectType(candidate);
          if (detected === 'other') temporaryGarageEntries.push({ addr: candidate, type: 'other', price: Number(saved?.price) || 0 });
          lines[j] = transformAddress(candidate, saved);
          break;
        }
        blocks[i + 1] = lines.join('\n');
      }

      if (!/\[\d+\.\d+,\s*\d+:\d+\]/.test(originalText)) {
        const lines = originalText.split('\n');
        for (let j = 0; j < lines.length; j++) {
          const m = lines[j].match(/^(.*?(?:ALLEY\s*PUB|F\s*[123])\s*[:\-\s]+)(.*)$/i);
          if (!m) continue;
          const address = stripPhone(m[2]).trim();
          if (!address || isPhone(address)) continue;
          const saved = findSaved(address, sources);
          const detected = saved?.type ? typeFromSaved(saved.type) : detectType(address);
          if (detected === 'other') temporaryGarageEntries.push({ addr: address, type: 'other', price: Number(saved?.price) || 0 });
          lines[j] = m[1] + transformAddress(address, saved);
        }
        input.value = lines.join('\n');
      } else {
        input.value = blocks.join('');
      }

      try {
        if (temporaryGarageEntries.length) {
          let current = [];
          try { current = JSON.parse(localStorage.getItem('waCustomAddrs') || '[]'); } catch (_) {}
          const keys = new Set(current.map(x => cleanForMatch(x.addr || x.address)));
          for (const item of temporaryGarageEntries) {
            const key = cleanForMatch(item.addr);
            if (!keys.has(key)) { current.push(item); keys.add(key); }
          }
          localStorage.setItem('waCustomAddrs', JSON.stringify(current));
        }
        return await originalParseWA();
      } finally {
        if (originalLocalAddresses === null) localStorage.removeItem('waCustomAddrs');
        else localStorage.setItem('waCustomAddrs', originalLocalAddresses);
        input.value = originalText;
      }
    };

    console.log('Enhanced WhatsApp address recognition enabled');
  }

  install();
})();
