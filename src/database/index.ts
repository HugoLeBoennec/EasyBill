/**
 * Database Module
 *
 * Main entry point for database access
 */

export * from './types';
export * from './database-manager';
export { InvoiceRepository } from './repositories/invoice-repository';
export { EInvoiceRepository } from './repositories/einvoice-repository';
export { PartyRepository } from './repositories/party-repository';

import { databaseManager } from './database-manager';
import { InvoiceRepository } from './repositories/invoice-repository';
import { EInvoiceRepository } from './repositories/einvoice-repository';
import { PartyRepository } from './repositories/party-repository';

/**
 * Database service with all repositories
 */
export class DatabaseService {
  private static instance: DatabaseService;

  public invoices: InvoiceRepository;
  public einvoices: EInvoiceRepository;
  public parties: PartyRepository;

  private constructor() {
    const db = databaseManager.getConnection();
    this.invoices = new InvoiceRepository(db);
    this.einvoices = new EInvoiceRepository(db);
    this.parties = new PartyRepository(db);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize database
   */
  public static async initialize(): Promise<DatabaseService> {
    await databaseManager.initialize();
    return DatabaseService.getInstance();
  }

  /**
   * Close database connection
   */
  public close(): void {
    databaseManager.close();
  }

  /**
   * Get database info
   */
  public getInfo() {
    return databaseManager.getInfo();
  }

  /**
   * Get database stats
   */
  public getStats() {
    return databaseManager.getStats();
  }

  /**
   * Backup database
   */
  public async backup(path: string): Promise<void> {
    return databaseManager.backup(path);
  }

  /**
   * Restore database from backup
   */
  public async restore(path: string): Promise<void> {
    return databaseManager.restore(path);
  }
}

// Export singleton getter
export const getDatabase = () => DatabaseService.getInstance();
