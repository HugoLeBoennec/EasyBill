/**
 * Small helpers shared by the repositories for binding named parameters.
 */

type SqlValue = string | number | bigint | Buffer | null;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const READ_ONLY_COLUMNS = ['id', 'created_at', 'updated_at'];

function toSqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SqlValue;
}

/**
 * Build the named-parameter object for an INSERT.
 *
 * better-sqlite3 throws when a named parameter is missing or `undefined`,
 * so every listed column gets a value: the record's, else the default,
 * else NULL. Keys of the record that are not listed are ignored.
 */
export function bindColumns(
  record: object,
  columns: readonly string[],
  defaults: Record<string, SqlValue> = {}
): Record<string, SqlValue> {
  const source = record as Record<string, unknown>;
  const params: Record<string, SqlValue> = {};

  for (const column of columns) {
    const value = source[column];
    params[column] =
      value === undefined || value === null
        ? (defaults[column] ?? null)
        : toSqlValue(value);
  }

  return params;
}

/**
 * Build a "col = @col" SET clause for an UPDATE.
 *
 * Column names come from callers (ultimately the renderer), so they are
 * checked before being interpolated into SQL. `undefined` values become NULL.
 * Returns an empty clause when there is nothing to update.
 */
export function buildSetClause(updates: object): {
  clause: string;
  params: Record<string, SqlValue>;
} {
  const params: Record<string, SqlValue> = {};
  const parts: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!IDENTIFIER.test(key) || READ_ONLY_COLUMNS.includes(key)) {
      throw new Error(`Unknown or read-only column: ${key}`);
    }
    parts.push(`${key} = @${key}`);
    params[key] = toSqlValue(value);
  }

  return { clause: parts.join(', '), params };
}
