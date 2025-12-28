import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dbInitialized: boolean | undefined;
};

/**
 * Ensure database exists and schema is up to date
 * Runs automatically on first import
 */
function ensureDatabase(): void {
  // Only run once per process
  if (globalForPrisma.dbInitialized) {
    return;
  }

  // Find the prisma directory (could be in different locations depending on build)
  const possiblePrismaPaths = [
    path.join(process.cwd(), 'prisma'),
    path.join(__dirname, '../../prisma'),
    path.join(__dirname, '../../../prisma'),
  ];

  let prismaDir: string | null = null;
  for (const p of possiblePrismaPaths) {
    if (fs.existsSync(path.join(p, 'schema.prisma'))) {
      prismaDir = p;
      break;
    }
  }

  if (!prismaDir) {
    console.warn('[DB] Could not find prisma directory, skipping auto-init');
    globalForPrisma.dbInitialized = true;
    return;
  }

  const dbPath = path.join(prismaDir, 'dev.db');
  const dbExists = fs.existsSync(dbPath);

  if (!dbExists) {
    console.log('[DB] Database not found, creating...');
    try {
      // Run prisma db push to create the database
      execSync('npx prisma db push --skip-generate', {
        cwd: process.cwd(),
        stdio: 'pipe',
        env: { ...process.env },
      });
      console.log('[DB] Database created successfully');
    } catch (error) {
      console.error('[DB] Failed to create database:', error);
      // Don't throw - let Prisma handle the error with a better message
    }
  }

  globalForPrisma.dbInitialized = true;
}

// Auto-initialize database on import
ensureDatabase();

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
