#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const PACKAGE_NAME = 'p42-util-flow-ape42_3060-xmetar';
const version      = process.argv[2] || '0.0.1';
const OUT_DIR      = path.join('dist', PACKAGE_NAME);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Windows FILETIME: 100-ns intervals since 1601-01-01 */
function toWinFileTime(date = new Date()) {
    return (date.getTime() + 11644473600000) * 10000;
}

/** Normalize line endings to CRLF */
function crlf(str) {
    return str.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

// ── Copy template ─────────────────────────────────────────────────────────────

fs.mkdirSync('dist', { recursive: true });
copyDir('template', OUT_DIR);

// Rename ContentInfo subfolder if it still uses the xmetar name
const ciOld = path.join(OUT_DIR, 'ContentInfo', 'p42-util-flow-Ape42_3060-xmetar');
const ciNew = path.join(OUT_DIR, 'ContentInfo', PACKAGE_NAME);
if (fs.existsSync(ciOld) && !fs.existsSync(ciNew)) {
    fs.renameSync(ciOld, ciNew);
}

// ── Inject source files into JSON template ────────────────────────────────────

const codeJs   = crlf(fs.readFileSync('code.js',   'utf8'));
const codeCss  = crlf(fs.readFileSync('code.css',  'utf8'));
const codeHtml = crlf(fs.readFileSync('code.html', 'utf8'));

const jsonPath = path.join(OUT_DIR, 'Flow', 'templates', `${PACKAGE_NAME}.json`);
const tmpl     = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

tmpl.scripts[0].params.code_js   = codeJs;
tmpl.scripts[0].params.code_css  = codeCss;
tmpl.scripts[0].params.code_html = codeHtml;
tmpl.scripts[0].params.last_edit = Date.now();
tmpl.scripts[0].params.creator   = tmpl.scripts[0].params.creator.toLowerCase();
tmpl.scripts[0].params.package   = tmpl.scripts[0].params.package.toLowerCase();

const jsonContent = JSON.stringify(tmpl, null, '\t');
fs.writeFileSync(jsonPath, jsonContent, 'utf8');

// ── Update manifest.json ──────────────────────────────────────────────────────

const manifestPath = path.join(OUT_DIR, 'manifest.json');
const manifest     = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.package_version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '    '), 'utf8');

// ── Update layout.json ────────────────────────────────────────────────────────

const thumbPath = path.join(OUT_DIR, 'ContentInfo', PACKAGE_NAME, 'Thumbnail.jpg');
const thumbSize = fs.existsSync(thumbPath) ? fs.statSync(thumbPath).size : 0;
const jsonSize  = Buffer.byteLength(jsonContent, 'utf8');
const now       = toWinFileTime();

const layout = {
    content: [
        {
            path: `ContentInfo/${PACKAGE_NAME}/Thumbnail.jpg`,
            size: thumbSize,
            date: now
        },
        {
            path: `Flow/templates/${PACKAGE_NAME}.json`,
            size: jsonSize,
            date: now
        }
    ]
};

fs.writeFileSync(
    path.join(OUT_DIR, 'layout.json'),
    JSON.stringify(layout, null, '\t'),
    'utf8'
);

console.log(`Built ${PACKAGE_NAME} v${version} → dist/`);
