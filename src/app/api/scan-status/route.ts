import { NextResponse } from 'next/server';
import { getScanStatus } from '@/lib/scan-status';

/**
 * GET /api/scan-status
 * Returns the current background scan status
 */
export async function GET() {
  const status = getScanStatus();

  return NextResponse.json(status, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
