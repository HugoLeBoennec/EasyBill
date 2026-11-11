/**
 * Database Manager for EasyBill
 *
 * Handles SQLite database connection, initialization, and migrations
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import type { DatabaseInfo, DatabaseStats } from './types';
// Import SQL schema as a string (Vite handles this automatically with ?raw suffix)
import schemaSql from './schema.sql?raw';
import migration002Sql from './migrations/002_add_quotes_and_signatures.sql?raw';
import migration003Sql from './migrations/003_add_seller_legal_mentions.sql?raw';
import migration004Sql from './migrations/004_add_credit_notes.sql?raw';

/**
 * Incremental migrations applied (in order) on top of schema.sql.
 * Each one is recorded in schema_migrations and runs only once.
 */
const MIGRATIONS: { version: string; sql: string }[] = [
  { version: '002', sql: migration002Sql },
  { version: '003', sql: migration003Sql },
  { version: '004', sql: migration004Sql },
];

/**
 * Apply pending migrations on an open connection.
 * Works for both fresh databases (schema.sql just applied) and existing ones.
 * Exported separately so it can be exercised without Electron.
 */
export function runMigrations(
  db: Database.Database,
  migrations: { version: string; sql: string }[] = MIGRATIONS
): string[] {
  const applied: string[] = [];
  const isApplied = db.prepare(
    'SELECT 1 FROM schema_migrations WHERE version = ?'
  );

  // Always in version order, whatever the order of the list
  const ordered = [...migrations].sort((a, b) => a.version.localeCompare(b.version));

  for (const migration of ordered) {
    if (isApplied.get(migration.version)) continue;

    // SQLite has no "ADD COLUMN IF NOT EXISTS": drop ALTERs whose column is
    // already there so a partially migrated database can still be upgraded.
    const sql = migration.sql.replace(
      /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)[^;]*;/gi,
      (statement, table: string, column: string) => {
        const columns = db
          .prepare(`SELECT name FROM pragma_table_info('${table}')`)
          .all() as { name: string }[];
        return columns.some((c) => c.name === column) ? '' : statement;
      }
    );

    // DDL is transactional in SQLite: either the whole migration applies or none
    db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)'
      ).run(migration.version, `migration_${migration.version}`);
    })();

    applied.push(migration.version);
  }

  return applied;
}

/**
 * Database Manager Singleton
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database | null = null;
  private dbPath: string;

  private constructor() {
    // Determine database path based on environment
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'easybill.db');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database connection and schema
   */
  public async initialize(): Promise<void> {
    if (this.db) {
      console.log('Database already initialized');
      return;
    }

    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      });

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Set journal mode to WAL for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Apply schema
      await this.applySchema();

      console.log(`Database initialized at: ${this.dbPath}`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Apply database schema from SQL file
   */
  private async applySchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Execute schema (imported as string at build time)
    this.db.exec(schemaSql);

    // Apply incremental migrations (quotes, signatures, payment terms, ...)
    const applied = runMigrations(this.db);
    if (applied.length > 0) {
      console.log(`Migrations applied: ${applied.join(', ')}`);
    }

    console.log('Database schema applied successfully');
  }

  /**
   * Get database connection
   */
  public getConnection(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a raw SQL query
   */
  public exec(sql: string): void {
    this.getConnection().exec(sql);
  }

  /**
   * Prepare a statement
   */
  public prepare(sql: string): Database.Statement {
    return this.getConnection().prepare(sql);
  }

  /**
   * Run a transaction
   */
  public transaction<T>(fn: () => T): T {
    const txn = this.getConnection().transaction(fn);
    return txn();
  }

  /**
   * Get database information
   */
  public getInfo(): DatabaseInfo {
    const db = this.getConnection();

    // Get database size
    const stat = fs.statSync(this.dbPath);

    // Get all tables
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((row: any) => row.name);

    // Get last migration
    const lastMigration = db
      .prepare(
        'SELECT version FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT 1'
      )
      .get() as { version: string } | undefined;

    return {
      version: lastMigration?.version || 'unknown',
      path: this.dbPath,
      size: stat.size,
      tables,
      last_migration: lastMigration?.version,
    };
  }

  /**
   * Get database statistics
   */
  public getStats(): DatabaseStats {
    const db = this.getConnection();

    const stats = db
      .prepare(
        `
      SELECT
        (SELECT COUNT(*) FROM invoices WHERE invoice_type != 'credit_note') as total_invoices,
        (SELECT COUNT(*) FROM invoices WHERE invoice_type != 'credit_note' AND status = 'draft') as draft_invoices,
        (SELECT COUNT(*) FROM invoices WHERE invoice_type != 'credit_note' AND status = 'finalized') as finalized_invoices,
        (SELECT COUNT(*) FROM invoices WHERE invoice_type != 'credit_note' AND status = 'sent') as sent_invoices,
        (SELECT COUNT(*) FROM invoices WHERE invoice_type != 'credit_note' AND is_signed = 1) as signed_invoices,
        (SELECT COUNT(*) FROM invoices WHERE invoice_type = 'credit_note' AND status != 'draft') as total_credit_notes,
        (SELECT COUNT(*) FROM quotes) as total_quotes,
        (SELECT COUNT(*) FROM parties) as total_parties,
        (SELECT COUNT(*) FROM parties WHERE party_type = 'customer') as total_customers,
        (SELECT COUNT(*) FROM einvoice_queue WHERE queue_status IN ('pending', 'failed')) as pending_einvoices,
        (SELECT COUNT(*) FROM pa_transmission_log WHERE transmission_status = 'failure') as failed_transmissions
    `
      )
      .get() as DatabaseStats;

    return stats;
  }

  /**
   * Backup database to specified path
   */
  public async backup(backupPath: string): Promise<void> {
    const db = this.getConnection();

    // better-sqlite3's online backup API: copies the database page by page
    // and resolves once the backup file is complete
    await db.backup(backupPath);
  }

  /**
   * Restore database from backup
   */
  public async restore(backupPath: string): Promise<void> {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    // Close current connection
    this.close();

    // Copy backup file to database path
    fs.copyFileSync(backupPath, this.dbPath);

    // Reinitialize database
    await this.initialize();
  }

  /**
   * Vacuum database to reclaim space
   */
  public vacuum(): void {
    this.getConnection().exec('VACUUM');
  }

  /**
   * Analyze database for query optimization
   */
  public analyze(): void {
    this.getConnection().exec('ANALYZE');
  }

  /**
   * Check database integrity
   */
  public checkIntegrity(): boolean {
    const result = this.getConnection()
      .prepare('PRAGMA integrity_check')
      .get() as { integrity_check: string };

    return result.integrity_check === 'ok';
  }

  /**
   * Reset database (DANGEROUS - deletes all data)
   */
  public async reset(): Promise<void> {
    this.close();

    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }

    await this.initialize();
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }

  /**
   * Check if database is initialized
   */
  public isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Get database path
   */
  public getPath(): string {
    return this.dbPath;
  }
}

// Export singleton instance
export const databaseManager = DatabaseManager.getInstance();
