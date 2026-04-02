import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as path from 'path';
import { PromptVersion } from '../types';

export class VersionRepository {
  private db: Database.Database;

  constructor(storagePath: string) {
    const dbPath = path.join(storagePath, 'promptforge.db');
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path     TEXT    NOT NULL,
        content       TEXT    NOT NULL,
        content_hash  TEXT    NOT NULL,
        message       TEXT,
        parent_id     INTEGER REFERENCES prompt_versions(id),
        source        TEXT    DEFAULT 'manual',
        created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(file_path, content_hash)
      );

      CREATE TABLE IF NOT EXISTS evaluations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        version_a_id    INTEGER REFERENCES prompt_versions(id),
        version_b_id    INTEGER REFERENCES prompt_versions(id),
        context_label   TEXT,
        coherence_a     REAL, coherence_b  REAL,
        precision_a     REAL, precision_b  REAL,
        tone_a          REAL, tone_b       REAL,
        safety_a        REAL, safety_b     REAL,
        winner          TEXT,
        reasoning_json  TEXT,
        created_at      INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  }

  upsert(filePath: string, content: string, source: 'manual' | 'suggested' = 'manual', parentId?: number): number {
    const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    this.db.prepare(`
      INSERT OR IGNORE INTO prompt_versions (file_path, content, content_hash, source, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(filePath, content, hash, source, parentId ?? null);

    const row = this.db.prepare(`
      SELECT id FROM prompt_versions
      WHERE file_path = ? AND content_hash = ?
    `).get(filePath, hash) as { id: number };

    return row.id;
  }

  listByFile(filePath: string): PromptVersion[] {
    return this.db.prepare(`
      SELECT * FROM prompt_versions
      WHERE file_path = ?
      ORDER BY created_at DESC
    `).all(filePath) as PromptVersion[];
  }

  getById(id: number): PromptVersion | undefined {
    return this.db.prepare(`
      SELECT * FROM prompt_versions WHERE id = ?
    `).get(id) as PromptVersion | undefined;
  }

  updateMessage(id: number, message: string): void {
    this.db.prepare(`
      UPDATE prompt_versions SET message = ? WHERE id = ?
    `).run(message, id);
  }
}