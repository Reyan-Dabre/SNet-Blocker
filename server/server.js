'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { execSync } = require('child_process');
const firewall = require('./firewall');
require('dotenv').config();

// ─── ADMIN CHECK ─────────────────────────────────────────
try {
    execSync('net session', { stdio: 'ignore' });
} catch {
    console.error('❌ Run as Administrator');
    process.exit(1);
}

// ─── EXPRESS ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── DB POOL ─────────────────────────────────────────────
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'snet_db',
    waitForConnections: true,
    connectionLimit: 10
});

async function ensureRuleTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS manual_rules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            domain VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_manual_rule (user_id, domain),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS trusted_rules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            domain VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_trusted_rule (user_id, domain),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Backward-compatible migration from legacy `rules` table.
    await db.query(`
        INSERT IGNORE INTO manual_rules (user_id, domain)
        SELECT user_id, domain FROM rules WHERE type='manual'
    `).catch(() => {});

    await db.query(`
        INSERT IGNORE INTO trusted_rules (user_id, domain)
        SELECT user_id, domain FROM rules WHERE type='trusted'
    `).catch(() => {});
}

// ─── INIT ───────────────────────────────────────────────
(async () => {
    try {
        await db.query('SELECT 1');
        console.log('✅ MySQL connected');
        await ensureRuleTables();

        await firewall.blockInsecureProtocols();
        await firewall.reapplyAllRules(db);

    } catch (e) {
        console.error('❌ INIT ERROR:', e.message);
        process.exit(1);
    }
})();

// ─── HEALTH ─────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ─── VERIFY SESSION ─────────────────────────────────────
app.get('/verify/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, email FROM users WHERE id=?',
            [req.params.userId]
        );

        if (rows.length > 0) {
            return res.json({
                valid: true,
                user_id: rows[0].id,
                email: rows[0].email
            });
        }

        res.json({ valid: false });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── AUTH ───────────────────────────────────────────────

// SIGNUP
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        const [exists] = await db.query(
            'SELECT id FROM users WHERE email=?',
            [email]
        );

        if (exists.length) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hash = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [email, hash]
        );

        console.log(`✅ Signup: ${email}`);

        res.json({ user_id: result.insertId });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE email=?',
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ error: 'User not found' });
        }

        let valid = false;
        if (rows[0].password && rows[0].password.startsWith('$2')) {
            valid = await bcrypt.compare(password, rows[0].password);
        } else {
            valid = (password === rows[0].password);
            // If valid, should ideally re-hash and update DB here, but this gets them in.
        }

        if (!valid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        res.json({
            success: true,
            user_id: rows[0].id
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── BLOCK (MANUAL) ─────────────────────────────────────
app.post('/block', async (req, res) => {
    const { userId, domain, type } = req.body;

    if (!userId || !domain || !type) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        let fw = { skipped: true };

        if (type === 'manual') {
            await db.query(
                `INSERT INTO manual_rules (user_id, domain)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE domain=VALUES(domain)`,
                [userId, domain]
            );
            await db.query(
                'DELETE FROM trusted_rules WHERE user_id=? AND domain=?',
                [userId, domain]
            );
            fw = await firewall.blockDomain(domain);
        } else if (type === 'trusted') {
            await db.query(
                `INSERT INTO trusted_rules (user_id, domain)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE domain=VALUES(domain)`,
                [userId, domain]
            );
            await db.query(
                'DELETE FROM manual_rules WHERE user_id=? AND domain=?',
                [userId, domain]
            );
            // Trusted domains should be actively unblocked at OS level.
            fw = await firewall.unblockDomain(domain);
            await db.query(
                'DELETE FROM auto_rules WHERE user_id=? AND domain=?',
                [userId, domain]
            );
        }

        res.json({ success: true, firewall: fw });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── AUTOBLOCK ──────────────────────────────────────────
app.post('/autoblock', async (req, res) => {
    const { userId, domain, reason } = req.body;

    if (!userId || !domain) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        await db.query(
            `INSERT INTO auto_rules (user_id, domain, reason)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE reason=?`,
            [userId, domain, reason || 'Auto', reason || 'Auto']
        );

        const fw = await firewall.blockDomain(domain);

        console.log(`🚨 AUTO BLOCKED: ${domain}`);

        res.json({ success: true, firewall: fw });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── LIST RULES ─────────────────────────────────────────
app.get('/list/:userId', async (req, res) => {
    try {
        const { type } = req.query;
        if (type === 'manual' || type === 'trusted') {
            const tableName = type === 'manual' ? 'manual_rules' : 'trusted_rules';
            const [rows] = await db.query(
                `SELECT domain, ? AS type FROM ${tableName} WHERE user_id=?`,
                [type, req.params.userId]
            );
            return res.json(rows);
        } else {
            const [manualRows] = await db.query(
                'SELECT domain, "manual" AS type FROM manual_rules WHERE user_id=?',
                [req.params.userId]
            );
            const [trustedRows] = await db.query(
                'SELECT domain, "trusted" AS type FROM trusted_rules WHERE user_id=?',
                [req.params.userId]
            );
            return res.json([...manualRows, ...trustedRows]);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/autolist/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT domain, reason FROM auto_rules WHERE user_id=?',
            [req.params.userId]
        );
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── REMOVE RULES ──────────────────────────────────────
app.post('/unblock', async (req, res) => {
    const { userId, domain, type } = req.body;

    if (!userId || !domain) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        if (type === 'manual' || type === 'trusted') {
            const tableName = type === 'manual' ? 'manual_rules' : 'trusted_rules';
            await db.query(
                `DELETE FROM ${tableName} WHERE user_id=? AND domain=?`,
                [userId, domain]
            );
        } else {
            await db.query(
                'DELETE FROM manual_rules WHERE user_id=? AND domain=?',
                [userId, domain]
            );
            await db.query(
                'DELETE FROM trusted_rules WHERE user_id=? AND domain=?',
                [userId, domain]
            );
        }

        // Only unblock at OS layer if domain is no longer present
        // in manual rules or auto rules.
        const [stillManual] = await db.query(
            'SELECT id FROM manual_rules WHERE user_id=? AND domain=? LIMIT 1',
            [userId, domain]
        );
        const [stillAuto] = await db.query(
            'SELECT id FROM auto_rules WHERE user_id=? AND domain=? LIMIT 1',
            [userId, domain]
        );

        let fw = { skipped: true };
        if (!stillManual.length && !stillAuto.length) {
            fw = await firewall.unblockDomain(domain);
        }

        res.json({ success: true, firewall: fw });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/unautoblock', async (req, res) => {
    const { userId, domain } = req.body;

    if (!userId || !domain) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        await db.query(
            'DELETE FROM auto_rules WHERE user_id=? AND domain=?',
            [userId, domain]
        );

        const [stillManual] = await db.query(
            'SELECT id FROM manual_rules WHERE user_id=? AND domain=? LIMIT 1',
            [userId, domain]
        );

        let fw = { skipped: true };
        if (!stillManual.length) {
            fw = await firewall.unblockDomain(domain);
        }

        res.json({ success: true, firewall: fw });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.get('/stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        const [[manual]] = await db.query(
            'SELECT COUNT(*) AS count FROM manual_rules WHERE user_id=?',
            [userId]
        );
        const [[trusted]] = await db.query(
            'SELECT COUNT(*) AS count FROM trusted_rules WHERE user_id=?',
            [userId]
        );
        const [[autoBlocked]] = await db.query(
            'SELECT COUNT(*) AS count FROM auto_rules WHERE user_id=?',
            [userId]
        );

        const [recentThreats] = await db.query(
            'SELECT domain, reason FROM auto_rules WHERE user_id=? ORDER BY id DESC LIMIT 5',
            [userId]
        );

        const manualRules = Number(manual.count || 0);
        const trustedRules = Number(trusted.count || 0);
        const autoRules = Number(autoBlocked.count || 0);

        res.json({
            blockedToday: autoRules,
            totalBlocked: manualRules + autoRules,
            manualRules,
            trustedRules,
            autoRules,
            recentThreats
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/sync/snapshot/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        const [[manual]] = await db.query(
            'SELECT COUNT(*) AS count FROM manual_rules WHERE user_id=?',
            [userId]
        );
        const [[trusted]] = await db.query(
            'SELECT COUNT(*) AS count FROM trusted_rules WHERE user_id=?',
            [userId]
        );
        const [[autoBlocked]] = await db.query(
            'SELECT COUNT(*) AS count FROM auto_rules WHERE user_id=?',
            [userId]
        );

        const manualRules = Number(manual.count || 0);
        const trustedRules = Number(trusted.count || 0);
        const autoRules = Number(autoBlocked.count || 0);

        res.json({
            manualRules,
            trustedRules,
            autoRules,
            totalRules: manualRules + trustedRules + autoRules,
            syncedAt: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── START SERVER ───────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🚀 SNet Blocker running on http://172.20.188.138:' + PORT);
    console.log('🔥 Firewall ACTIVE');
    console.log('🛡️ Content Filter ACTIVE');
    console.log('');
});

// ─── ERROR HANDLING ─────────────────────────────────────
process.on('uncaughtException', err => {
    console.error('CRASH:', err);
});

process.on('unhandledRejection', err => {
    console.error('PROMISE ERROR:', err);
});
