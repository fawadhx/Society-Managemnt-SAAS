import { Pool, type QueryResultRow } from "pg";

// Next.js dev-mode hot-reload re-evaluates this module on every edit, which
// would otherwise leak a new Pool (and its connections) each time. Stash the
// singleton on `global` the same way Prisma client singletons are written.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => {
    console.error("Unexpected error on idle Postgres client", err);
  });
  return pool;
}

const pool = global.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  try {
    const result = await pool.query<T>(text, params);
    return result.rows;
  } catch (err) {
    console.error("Postgres query failed:", text, err);
    throw err;
  }
}

export default pool;
