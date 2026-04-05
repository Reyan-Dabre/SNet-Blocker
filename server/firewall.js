'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const dns = require('dns');
const fs = require('fs').promises;

const execAsync = promisify(exec);

// ─── Constants ─────────────────────────────────────────
const HOSTS_FILE = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const RULE_PREFIX = 'SNet-';
const MARKER_TAG = '# SNet-managed';

// Use external DNS (bypass hosts file)
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

// ─── Helpers ───────────────────────────────────────────

async function resolveIPs(domain) {
    return new Promise((resolve) => {
        resolver.resolve4(domain, (err, addrs) => {
            resolve(err ? [] : addrs || []);
        });
    });
}

async function ps(command) {
    const { stdout } = await execAsync(
        `powershell -NoProfile -NonInteractive -Command "${command.replace(/"/g, '\\"')}"`
    );
    return stdout.trim();
}

// ─── Firewall Rules ─────────────────────────────────────

async function addFirewallRule(domain, ips) {
    if (!ips.length) return;

    const name = `${RULE_PREFIX}${domain}`;
    const remote = ips.join(',');

    await ps(`Remove-NetFirewallRule -DisplayName '${name}' -ErrorAction SilentlyContinue`).catch(() => {});

    await ps(
        `New-NetFirewallRule -DisplayName '${name}' -Direction Outbound -Action Block -RemoteAddress '${remote}' -Profile Any -Enabled True`
    );
}

async function removeFirewallRule(domain) {
    const name = `${RULE_PREFIX}${domain}`;
    await ps(`Remove-NetFirewallRule -DisplayName '${name}' -ErrorAction SilentlyContinue`).catch(() => {});
}

// ─── Hosts File ─────────────────────────────────────────

async function addToHostsFile(domain) {
    let content = await fs.readFile(HOSTS_FILE, 'utf8');
    const marker = `${MARKER_TAG}:${domain}`;

    if (content.includes(marker)) return;

    const entry =
        `\n127.0.0.1\t${domain}\t${marker}` +
        `\n127.0.0.1\twww.${domain}\t${marker}\n`;

    await fs.appendFile(HOSTS_FILE, entry);
}

async function removeFromHostsFile(domain) {
    const marker = `${MARKER_TAG}:${domain}`;
    const content = await fs.readFile(HOSTS_FILE, 'utf8');

    const cleaned = content
        .split('\n')
        .filter(line => !line.includes(marker))
        .join('\n');

    await fs.writeFile(HOSTS_FILE, cleaned);
}

// ─── Public API ─────────────────────────────────────────

async function blockDomain(domain) {
    const result = {
        domain,
        ips: [],
        hostsBlocked: false,
        firewallBlocked: false,
        errors: []
    };

    try {
        result.ips = await resolveIPs(domain);

        await addToHostsFile(domain);
        result.hostsBlocked = true;

        if (result.ips.length) {
            await addFirewallRule(domain, result.ips);
            result.firewallBlocked = true;
        }

        console.log(`[SNet] BLOCKED ${domain}`);

    } catch (e) {
        result.errors.push(e.message);
    }

    return result;
}

async function unblockDomain(domain) {
    const errors = [];

    try { await removeFromHostsFile(domain); }
    catch (e) { errors.push(e.message); }

    try { await removeFirewallRule(domain); }
    catch (e) { errors.push(e.message); }

    console.log(`[SNet] UNBLOCKED ${domain}`);

    return { domain, success: true, errors };
}

async function blockInsecureProtocols() {
    const rules = [
        { name: `${RULE_PREFIX}FTP`, port: 21 },
        { name: `${RULE_PREFIX}TELNET`, port: 23 },
        { name: `${RULE_PREFIX}SFTP`, port: 22 }
    ];

    for (const r of rules) {
        await ps(
            `New-NetFirewallRule -DisplayName '${r.name}' -Direction Outbound -Action Block -Protocol TCP -RemotePort ${r.port} -Profile Any -Enabled True -ErrorAction SilentlyContinue`
        ).catch(() => {});
    }

    console.log('[SNet] Protocol blocks applied');
}

// ✅ FIXED VERSION (NO CALLBACKS)
async function reapplyAllRules(db) {
    try {
        const [rows] = await db.query(`
            SELECT domain FROM manual_rules
            UNION
            SELECT domain FROM auto_rules
        `);

        console.log(`[SNet] Reapplying ${rows.length} rules...`);

        for (const row of rows) {
            try {
                await blockDomain(row.domain);
            } catch (e) {
                console.warn(`Failed: ${row.domain}`, e.message);
            }
        }

    } catch (err) {
        console.error('Reapply error:', err.message);
    }
}

module.exports = {
    blockDomain,
    unblockDomain,
    blockInsecureProtocols,
    reapplyAllRules
};
