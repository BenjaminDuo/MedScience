import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SourceIdentifiers } from './EvidenceLedger.js';

/**
 * Local index of retraction notices, imported from a CSV file.
 *
 * The intended source is the Retraction Watch database, which Crossref has
 * distributed openly since 2023 as a single CSV. Its columns are matched by
 * name (case and punctuation ignored), so a later release that reorders
 * columns still imports; a minimal file with `doi,pmid,nature,date,reason`
 * columns works too. Nothing is fetched over the network here -- the user
 * imports a file they downloaded, and the index records which file and when.
 */

export type RetractionNature = 'retraction' | 'expression-of-concern' | 'correction' | 'reinstatement' | 'other';

export interface RetractionNotice {
  doi?: string;
  pmid?: string;
  nature: RetractionNature;
  /** ISO date (YYYY-MM-DD) of the notice, when known. */
  date?: string;
  reason?: string;
  recordId?: string;
  title?: string;
}

export interface RetractionImportResult {
  imported: number;
  skipped: number;
  total: number;
  /** Header names that were recognised, for the import report. */
  matchedColumns: string[];
}

interface IndexFile {
  version: 1;
  importedAt?: string;
  source?: string;
  notices: RetractionNotice[];
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export function normalizeDoi(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const doi = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '');
  return /^10\.\d{4,9}\//.test(doi) ? doi : undefined;
}

export function normalizePmid(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const pmid = raw.trim().replace(/^pmid:\s*/i, '');
  // Retraction Watch writes 0 when a paper has no PubMed id.
  return /^[1-9]\d{0,9}$/.test(pmid) ? pmid : undefined;
}

export function parseNature(raw: string | undefined): RetractionNature {
  const v = (raw ?? '').trim().toLowerCase();
  if (v.startsWith('retraction')) return 'retraction';
  if (v.startsWith('expression of concern') || v === 'eoc' || v === 'expression-of-concern') return 'expression-of-concern';
  if (v.startsWith('correction')) return 'correction';
  if (v.startsWith('reinstatement')) return 'reinstatement';
  return v ? 'other' : 'retraction';
}

/** "MM/DD/YYYY 0:00" (Retraction Watch) or ISO -> YYYY-MM-DD; anything else -> undefined. */
/** Retraction Watch writes reasons as "+Reason A;+Reason B;"; this makes them readable. */
export function cleanReason(raw: string | undefined): string | undefined {
  const parts = (raw ?? '')
    .split(';')
    .map((p) => p.trim().replace(/^\+/, '').trim())
    .filter(Boolean);
  return parts.length ? parts.join('; ') : undefined;
}

export function parseNoticeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : undefined;
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const COLUMN_ALIASES: Record<keyof Omit<RetractionNotice, 'nature'> | 'nature', string[]> = {
  doi: ['originalpaperdoi', 'doi'],
  pmid: ['originalpaperpubmedid', 'pmid', 'pubmedid'],
  nature: ['retractionnature', 'nature'],
  date: ['retractiondate', 'date'],
  reason: ['reason', 'reasons'],
  recordId: ['recordid', 'id'],
  title: ['title'],
};

export function defaultRetractionIndexPath(): string {
  const base = process.env.MEDSCIENCE_HOME || path.join(os.homedir(), '.medscience');
  return path.join(base, 'ledger', 'retractions.json');
}

export class RetractionIndex {
  private byDoi = new Map<string, RetractionNotice[]>();
  private byPmid = new Map<string, RetractionNotice[]>();
  private notices: RetractionNotice[] = [];
  private meta: { importedAt?: string; source?: string } = {};
  private file?: string;

  constructor(options: { file?: string; persist?: boolean } = {}) {
    if (options.persist !== false) {
      this.file = options.file ?? defaultRetractionIndexPath();
      this.load();
    }
  }

  public size(): number {
    return this.notices.length;
  }

  public info(): { size: number; importedAt?: string; source?: string } {
    return { size: this.notices.length, ...this.meta };
  }

  /** Imports notices from CSV text, replacing the current index. */
  public importCsv(text: string, source = 'csv'): RetractionImportResult {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (rows.length === 0) return { imported: 0, skipped: 0, total: 0, matchedColumns: [] };
    const header = rows[0].map(key);
    const col: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {};
    const matchedColumns: string[] = [];
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof typeof COLUMN_ALIASES, string[]][]) {
      const idx = aliases.map((a) => header.indexOf(a)).find((i) => i >= 0);
      if (idx !== undefined) {
        col[field] = idx;
        matchedColumns.push(rows[0][idx]);
      }
    }
    if (col.doi === undefined && col.pmid === undefined) {
      throw new Error('The CSV has no DOI or PubMed id column (expected e.g. OriginalPaperDOI / OriginalPaperPubMedID, or doi / pmid).');
    }

    const notices: RetractionNotice[] = [];
    let skipped = 0;
    for (const row of rows.slice(1)) {
      const get = (f: keyof typeof COLUMN_ALIASES) => (col[f] !== undefined ? row[col[f]!] : undefined);
      const doi = normalizeDoi(get('doi'));
      const pmid = normalizePmid(get('pmid'));
      if (!doi && !pmid) {
        skipped++;
        continue;
      }
      notices.push({
        doi,
        pmid,
        nature: parseNature(get('nature')),
        date: parseNoticeDate(get('date')),
        reason: cleanReason(get('reason')),
        recordId: get('recordId')?.trim() || undefined,
        title: get('title')?.trim() || undefined,
      });
    }
    this.setNotices(notices, { importedAt: new Date().toISOString(), source });
    this.save();
    return { imported: notices.length, skipped, total: rows.length - 1, matchedColumns };
  }

  public importFile(filePath: string): RetractionImportResult {
    return this.importCsv(fs.readFileSync(filePath, 'utf8'), path.basename(filePath));
  }

  /** Every notice matching any of the identifiers, oldest first. */
  public lookup(ids: SourceIdentifiers | undefined): RetractionNotice[] {
    if (!ids) return [];
    const found = new Set<RetractionNotice>();
    for (const d of ids.doi ?? []) {
      const n = normalizeDoi(d);
      if (n) this.byDoi.get(n)?.forEach((x) => found.add(x));
    }
    for (const p of ids.pmid ?? []) {
      const n = normalizePmid(p);
      if (n) this.byPmid.get(n)?.forEach((x) => found.add(x));
    }
    return [...found].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  }

  /**
   * The notice that decides the paper's standing as of `asOf` (default:
   * now): the latest retraction, expression of concern or reinstatement on
   * or before that date. A later reinstatement clears an earlier
   * retraction; corrections never change standing.
   */
  public effectiveNotice(ids: SourceIdentifiers | undefined, asOf?: string): RetractionNotice | undefined {
    const relevant = this.lookup(ids).filter(
      (n) => (n.nature === 'retraction' || n.nature === 'expression-of-concern' || n.nature === 'reinstatement') && (!asOf || !n.date || n.date <= asOf)
    );
    const latest = relevant[relevant.length - 1];
    return latest && latest.nature !== 'reinstatement' ? latest : undefined;
  }

  private setNotices(notices: RetractionNotice[], meta: { importedAt?: string; source?: string }): void {
    this.notices = notices;
    this.meta = meta;
    this.byDoi.clear();
    this.byPmid.clear();
    for (const n of notices) {
      if (n.doi) this.byDoi.set(n.doi, [...(this.byDoi.get(n.doi) ?? []), n]);
      if (n.pmid) this.byPmid.set(n.pmid, [...(this.byPmid.get(n.pmid) ?? []), n]);
    }
  }

  private save(): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const body: IndexFile = { version: 1, ...this.meta, notices: this.notices };
    fs.writeFileSync(this.file, JSON.stringify(body), 'utf8');
  }

  private load(): void {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as IndexFile;
      if (parsed.version === 1 && Array.isArray(parsed.notices)) {
        this.setNotices(parsed.notices, { importedAt: parsed.importedAt, source: parsed.source });
      }
    } catch {
      // An unreadable index is treated as empty; the next import rewrites it.
    }
  }
}

let globalIndex: RetractionIndex | undefined;

export function getGlobalRetractionIndex(): RetractionIndex {
  if (!globalIndex) globalIndex = new RetractionIndex();
  return globalIndex;
}
