'use strict';

const KNOWN_DANGEROUS_DOMAINS = [
    'bet365.com', 'betway.com', '888casino.com', 'pokerstars.com',
    '1xbet.com', 'stake.com', 'roobet.com', 'bc.game',
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com',
    'redtube.com', 'youporn.com', 'spankbang.com', 'onlyfans.com',
    'thepiratebay.org', '1337x.to', 'yts.mx', 'grabify.link', 'iplogger.org'
];

const FORBIDDEN_KEYWORDS = {
    gambling: ['casino', 'slots', 'jackpot', 'betting', 'poker', 'roulette', 'lottery', 'gamble', 'wager', 'bookmaker', 'sportsbook'],
    adult: ['porn', 'xxx', 'nude', 'escort', 'hentai', 'nsfw', 'sex', 'fetish'],
    malware: ['crack', 'keygen', 'hack', 'trojan', 'virus', 'ransomware']
};

const HIGH_RISK_TLDS = ['.onion', '.zip', '.mov', '.top', '.gdn', '.buzz', '.tk', '.ml', '.ga', '.cf', '.xyz', '.pw', '.cc', '.icu', '.cam', '.xxx', '.porn'];

function calculateSecurityScore(urlObj) {
    let score = 100;
    const flags = [];
    let category = null;

    const hostname = (urlObj.hostname || '').toLowerCase();
    const fullUrl = (urlObj.href || '').toLowerCase();
    const pathname = (urlObj.pathname || '').toLowerCase();

    if (KNOWN_DANGEROUS_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
        return { score: 0, reasons: ['Known dangerous domain'], status: 'Danger', category: 'Restricted' };
    }

    if (hostname.includes('xn--') || /[^\x00-\x7F]/.test(hostname)) {
        score = 0;
        flags.push('IDN Homograph Attack');
        category = 'Phishing';
    }

    if (HIGH_RISK_TLDS.some(tld => hostname.endsWith(tld))) {
        score -= 50;
        flags.push('High-risk TLD');
    }

    const text = hostname + ' ' + pathname;
    for (const [cat, words] of Object.entries(FORBIDDEN_KEYWORDS)) {
        const matched = words.filter(w => text.includes(w));
        if (matched.length) {
            score -= Math.min(matched.length * 20, 80);
            flags.push(`${cat}: ${matched.slice(0, 3).join(', ')}`);
            if (!category) category = cat;
        }
    }

    if (/\d{4,}/.test(hostname)) {
        score -= 15;
        flags.push('Numeric domain');
    }

    if (hostname.split('.').length > 4) {
        score -= 10;
        flags.push('Too many subdomains');
    }

    if (fullUrl.includes('@')) {
        score -= 30;
        flags.push('@ redirect trick');
    }

    const normalized = Math.max(0, score);
    return {
        score: normalized,
        reasons: flags,
        status: normalized > 70 ? 'Safe' : normalized > 40 ? 'Warning' : 'Danger',
        category
    };
}
