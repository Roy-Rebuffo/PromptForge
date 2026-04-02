import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import initSqlJs, { Database } from 'sql.js';
import { PromptVersion } from '../types';

export class VersionRepository {
  private db: Database | null = null;
  private dbPath: string;

  constructor(storagePath: string) {
    fs.mkdirSync(storagePath, { recursive: true });
    this.dbPath = path.join(storagePath, 'promptforge.db');
  }

  // sql.js requires async init — call this before any other method
  async initialize(): Promise<void> {
    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.createTables();
  }

  private save(): void {
    if (!this.db) { return; }
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private createTables(): void {
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path     TEXT    NOT NULL,
        content       TEXT    NOT NULL,
        content_hash  TEXT    NOT NULL,
        message       TEXT,
        parent_id     INTEGER,
        source        TEXT    DEFAULT 'manual',
        created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        UNIQUE(file_path, content_hash)
      );

      CREATE TABLE IF NOT EXISTS evaluations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        version_a_id    INTEGER,
        version_b_id    INTEGER,
        context_label   TEXT,
        coherence_a     REAL, coherence_b  REAL,
        precision_a     REAL, precision_b  REAL,
        tone_a          REAL, tone_b       REAL,
        safety_a        REAL, safety_b     REAL,
        winner          TEXT,
        reasoning_json  TEXT,
        created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `);
    this.save();
  }

  upsert(
    filePath: string,
    content: string,
    source: 'manual' | 'suggested' = 'manual',
    parentId?: number
  ): number {
    const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    this.db!.run(
      `INSERT OR IGNORE INTO prompt_versions (file_path, content, content_hash, source, parent_id)
       VALUES (?, ?, ?, ?, ?)`,
      [filePath, content, hash, source, parentId ?? null]
    );

    const result = this.db!.exec(
      `SELECT id FROM prompt_versions WHERE file_path = ? AND content_hash = ?`,
      [filePath, hash]
    );

    this.save();
    return result[0].values[0][0] as number;
  }

  listByFile(filePath: string): PromptVersion[] {
    const result = this.db!.exec(
      `SELECT * FROM prompt_versions WHERE file_path = ? ORDER BY created_at DESC`,
      [filePath]
    );

    if (!result.length) { return []; }

    const { columns, values } = result[0];
    return values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj as PromptVersion;
    });
  }

  getById(id: number): PromptVersion | undefined {
    const result = this.db!.exec(
      `SELECT * FROM prompt_versions WHERE id = ?`,
      [id]
    );

    if (!result.length || !result[0].values.length) { return undefined; }

    const { columns, values } = result[0];
    const obj: any = {};
    columns.forEach((col, i) => obj[col] = values[0][i]);
    return obj as PromptVersion;
  }

  updateMessage(id: number, message: string): void {
    this.db!.run(
      `UPDATE prompt_versions SET message = ? WHERE id = ?`,
      [message, id]
    );
    this.save();
  }
}