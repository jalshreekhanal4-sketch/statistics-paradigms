#!/usr/bin/env node
/**
 * APA 7 .docx builder — profile driven.
 *
 *   node build-docx.js [content.md]
 *
 * Reads:
 *   profile.json   student name / university / courses / instructor
 *                  (searched for in this folder, then every parent folder)
 *   content.md     the assignment itself (see content.example.md)
 *
 * Writes:
 *   Last_First_COURSECODE_Type<N>.docx  in the same folder as the content file.
 *
 * Requires the `docx` package. Node resolves node_modules upward, so one
 * `npm install docx` at the top of your coursework folder covers every assignment.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Header, PageNumber, NumberFormat, ImageRun, ExternalHyperlink,
    Table, TableRow, TableCell, WidthType, BorderStyle,
} = require('docx');

/**
 * Give every drawing a unique id.
 *
 * OOXML requires wp:docPr/@id to be unique across the package. docx 9.7.1
 * builds a fresh id generator inside each drawing, so every image in a
 * document is emitted as id="1". Word treats the duplicates as invalid and
 * silently renders nothing — a document with several screenshots shows a
 * blank space where each one should be. Renumbering them here fixes it
 * regardless of what the library does.
 */
async function assignUniqueDrawingIds(buf) {
    const zip = await JSZip.loadAsync(buf);
    const parts = Object.keys(zip.files)
        .filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));

    let next = 1;
    for (const name of parts) {
        const xml = await zip.file(name).async('string');
        const fixed = xml
            .replace(/(<wp:docPr\b[^>]*?\bid=")\d+(")/g, (_m, a, b) => a + next++ + b)
            .replace(/(<pic:cNvPr\b[^>]*?\bid=")\d+(")/g, (_m, a, b) => a + next++ + b);
        zip.file(name, fixed);
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------- APA 7 constants
const TIMES = 'Times New Roman';
const COURIER = 'Courier New';
const SIZE_BODY = 24;    // 12pt, expressed in half-points
const SIZE_CODE = 16;    // 8pt — keeps long code lines from wrapping
const DOUBLE = 480;      // double spacing for 12pt
const SINGLE = 240;
const INCH = 1440;
const HALF_INCH = 720;

// ---------------------------------------------------------------- file helpers

/** Read a text file, tolerating a UTF-16 BOM. Reading UTF-16 bytes as UTF-8
 *  injects NUL characters into word/document.xml and Word then refuses to open
 *  the result — this has bitten us for real, so the guard stays. */
function readText(file) {
    const buf = fs.readFileSync(file);
    let txt = (buf[0] === 0xFF && buf[1] === 0xFE)
        ? buf.slice(2).toString('utf16le')
        : buf.toString('utf8');
    return txt.replace(/^﻿/, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** Walk up from `start` looking for `name`. */
function findUp(name, start) {
    let dir = path.resolve(start);
    for (;;) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function pngSize(file) {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ---------------------------------------------------------------- inline markup

/** Turn `plain *italic* **bold** [text](url)` into an array of docx runs. */
function runs(text, opts) {
    const o = opts || {};
    const font = o.font || TIMES;
    const size = o.size || SIZE_BODY;
    const out = [];
    // links first, since their label may itself contain emphasis
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let last = 0, m;
    const pushPlain = (s) => {
        if (!s) return;
        // **bold** then *italic*
        const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
        let i = 0, mm;
        while ((mm = re.exec(s)) !== null) {
            if (mm.index > i) out.push(new TextRun({ text: s.slice(i, mm.index), font, size }));
            if (mm[2] !== undefined) out.push(new TextRun({ text: mm[2], font, size, bold: true }));
            else out.push(new TextRun({ text: mm[4], font, size, italics: true }));
            i = re.lastIndex;
        }
        if (i < s.length) out.push(new TextRun({ text: s.slice(i), font, size }));
    };
    while ((m = linkRe.exec(text)) !== null) {
        pushPlain(text.slice(last, m.index));
        out.push(new ExternalHyperlink({
            children: [new TextRun({ text: m[1], font, size, color: '0000EE', underline: {} })],
            link: m[2],
        }));
        last = linkRe.lastIndex;
    }
    pushPlain(text.slice(last));
    return out.length ? out : [new TextRun({ text: '', font, size })];
}

// ---------------------------------------------------------------- paragraph factories

const centered = (text, bold) => new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { line: DOUBLE },
    children: runs(text).map(r => r),
    ...(bold ? {} : {}),
});
const centeredBold = (text) => new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { line: DOUBLE },
    children: [new TextRun({ text, font: TIMES, size: SIZE_BODY, bold: true })],
});
const blank = () => new Paragraph({
    spacing: { line: DOUBLE },
    children: [new TextRun({ text: '', font: TIMES, size: SIZE_BODY })],
});
const bodyPara = (text) => new Paragraph({
    spacing: { line: DOUBLE }, indent: { firstLine: HALF_INCH },
    children: runs(text),
});
const flushPara = (text) => new Paragraph({
    spacing: { line: DOUBLE }, children: runs(text),
});
const h1 = (text) => centeredBold(text);
const h2 = (text) => new Paragraph({
    spacing: { line: DOUBLE, before: 120 },
    children: [new TextRun({ text, font: TIMES, size: SIZE_BODY, bold: true })],
});
const caption = (text) => new Paragraph({
    spacing: { line: DOUBLE }, alignment: AlignmentType.LEFT,
    children: runs(text, {}).map(r => r),
});
const codeLine = (text) => new Paragraph({
    spacing: { line: SINGLE, before: 0, after: 0 },
    children: [new TextRun({ text: text.length ? text : ' ', font: COURIER, size: SIZE_CODE })],
});
const refPara = (text) => new Paragraph({
    spacing: { line: DOUBLE }, indent: { left: HALF_INCH, hanging: HALF_INCH },
    children: runs(text),
});
const pageBreak = () => new Paragraph({
    pageBreakBefore: true,
    children: [new TextRun({ text: '', font: TIMES, size: SIZE_BODY })],
});

/** APA 7 tables: no vertical rules, horizontal rules above and below the header
 *  row and below the last row only. Body text is single spaced inside cells. */
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const RULE = { style: BorderStyle.SINGLE, size: 6, color: '000000' };

function tableCell(text, isHeader, isLastRow) {
    return new TableCell({
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        borders: {
            top: isHeader ? RULE : NO_BORDER,
            bottom: (isHeader || isLastRow) ? RULE : NO_BORDER,
            left: NO_BORDER, right: NO_BORDER,
        },
        children: [new Paragraph({
            spacing: { line: SINGLE, before: 0, after: 0 },
            children: [new TextRun({
                text, font: TIMES, size: SIZE_BODY, bold: !!isHeader,
            })],
        })],
    });
}

/** Build a docx Table from markdown pipe-table rows already split into cells. */
function buildTable(rows) {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map((cells, i) => new TableRow({
            tableHeader: i === 0,
            children: cells.map(c => tableCell(c, i === 0, i === rows.length - 1)),
        })),
    });
}

// ---------------------------------------------------------------- content parsing

function parseFrontMatter(src) {
    const meta = {};
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { meta, rest: src };
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
        if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
    return { meta, rest: src.slice(m[0].length) };
}

/** Convert the markdown-ish body into docx paragraphs. */
function renderBody(src, baseDir) {
    const out = [];
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    let inReferences = false;
    let buffer = [];

    const flushBuffer = () => {
        if (!buffer.length) return;
        const text = buffer.join(' ').trim();
        buffer = [];
        if (!text) return;
        out.push(inReferences ? refPara(text) : bodyPara(text));
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // fenced code block
        if (/^```/.test(line.trim())) {
            flushBuffer();
            i++;
            while (i < lines.length && !/^```/.test(lines[i].trim())) {
                out.push(codeLine(lines[i]));
                i++;
            }
            continue;
        }

        // markdown pipe table:  | a | b |  with a |---|---| separator beneath
        if (/^\s*\|.*\|\s*$/.test(line) &&
            i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
            flushBuffer();
            const splitRow = (l) => l.trim().replace(/^\||\|$/g, '')
                .split('|').map(c => c.trim());
            const rows = [splitRow(line)];
            i += 2;                                   // skip the |---| separator
            while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
                rows.push(splitRow(lines[i]));
                i++;
            }
            i--;                                      // the for-loop re-increments
            out.push(buildTable(rows));
            out.push(blank());
            continue;
        }

        // image:  ![caption](file.png)
        const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (img) {
            flushBuffer();
            const file = path.resolve(baseDir, img[2]);
            if (!fs.existsSync(file)) {
                console.warn('  ! image not found, skipping: ' + img[2]);
                continue;
            }
            const s = pngSize(file);
            const w = 600;
            out.push(new Paragraph({
                alignment: AlignmentType.CENTER, spacing: { line: DOUBLE, before: 120 },
                children: [new ImageRun({
                    type: 'png', data: fs.readFileSync(file),
                    transformation: { width: w, height: Math.round(w * s.h / s.w) },
                })],
            }));
            if (img[1]) {
                out.push(new Paragraph({
                    spacing: { line: DOUBLE },
                    children: [new TextRun({ text: img[1], font: TIMES, size: SIZE_BODY, italics: true })],
                }));
            }
            continue;
        }

        // headings
        const hm = line.match(/^(#{1,3})\s+(.*)$/);
        if (hm) {
            flushBuffer();
            const title = hm[2].trim();
            if (/^references$/i.test(title)) {
                inReferences = true;
                out.push(pageBreak());
                out.push(h1('References'));
                continue;
            }
            inReferences = false;
            out.push(hm[1].length === 1 ? h1(title) : h2(title));
            continue;
        }

        // page break marker
        if (/^(---|\\pagebreak)\s*$/.test(line.trim())) { flushBuffer(); out.push(pageBreak()); continue; }

        if (line.trim() === '') { flushBuffer(); continue; }
        buffer.push(line.trim());
    }
    flushBuffer();
    return out;
}

// ---------------------------------------------------------------- naming

function compactCourseCode(courseLine) {
    // "MSCS-631-B01: Advanced Computer Networks" -> "MSCS631"
    const m = String(courseLine).match(/([A-Za-z]{2,6})[\s-]*(\d{2,4})/);
    return m ? (m[1].toUpperCase() + m[2]) : 'COURSE';
}

function splitName(full) {
    const parts = String(full).trim().split(/\s+/);
    const first = parts.shift() || 'First';
    const last = parts.length ? parts.pop() : 'Last';
    return { first, last };
}

function todayLong() {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ---------------------------------------------------------------- main

function main() {
    const contentArg = process.argv[2] || 'content.md';
    const contentPath = path.resolve(contentArg);
    if (!fs.existsSync(contentPath)) {
        console.error('No content file at ' + contentPath);
        console.error('Create one — see content.example.md for the format.');
        process.exit(1);
    }
    const baseDir = path.dirname(contentPath);

    const profilePath = findUp('profile.json', baseDir);
    if (!profilePath) {
        console.error('No profile.json found in this folder or any parent.');
        console.error('The skill should have created one. See profile.example.json.');
        process.exit(1);
    }
    const profile = JSON.parse(readText(profilePath));

    const { meta, rest } = parseFrontMatter(readText(contentPath));
    if (!meta.title) { console.error('content.md needs a `title:` in its front matter.'); process.exit(1); }

    // pick the course: front-matter `course` matches against profile.courses
    const courses = profile.courses || [];
    let course = courses[0];
    if (meta.course) {
        const key = meta.course.toLowerCase();
        course = courses.find(c =>
            String(c.code || '').toLowerCase().includes(key) ||
            String(c.title || '').toLowerCase().includes(key)) || course;
    }
    if (!course) { console.error('profile.json has no courses.'); process.exit(1); }

    const instructor = meta.instructor || course.instructor || profile.instructor || null;
    const { first, last } = splitName(profile.student_name);

    // ---- title page
    const titlePage = [
        blank(), blank(), blank(),
        centeredBold(meta.title),
        blank(),
        centered(profile.student_name),
        centered(profile.university),
        centered([course.code, course.title].filter(Boolean).join(': ')),
    ];
    if (instructor) titlePage.push(centered(instructor));
    titlePage.push(centered(meta.date || todayLong()));
    titlePage.push(pageBreak());
    titlePage.push(centeredBold(meta.title));

    const children = titlePage.concat(renderBody(rest, baseDir));

    const doc = new Document({
        creator: profile.student_name,
        lastModifiedBy: profile.student_name,
        title: meta.title,
        styles: { default: { document: { run: { font: TIMES, size: SIZE_BODY } } } },
        sections: [{
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },      // US Letter
                    margin: { top: INCH, right: INCH, bottom: INCH, left: INCH },
                    pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
                },
            },
            headers: {
                default: new Header({
                    children: [new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [new TextRun({ children: [PageNumber.CURRENT], font: TIMES, size: SIZE_BODY })],
                    })],
                }),
            },
            children,
        }],
    });

    const type = meta.type || 'Assignment';
    const num = meta.number ? String(meta.number) : '';
    const outName = `${last}_${first}_${compactCourseCode(course.code)}_${type}${num}.docx`
        .replace(/\s+/g, '');
    const outPath = path.join(baseDir, outName);

    Packer.toBuffer(doc).then(assignUniqueDrawingIds).then((buf) => {
        fs.writeFileSync(outPath, buf);
        console.log('Created: ' + outPath);
        console.log('  author : ' + profile.student_name);
        console.log('  course : ' + [course.code, course.title].filter(Boolean).join(': '));
        console.log('  dated  : ' + (meta.date || todayLong()));
        if (!instructor) console.log('  note   : no instructor on file, that title-page line was omitted');
    });
}

main();
