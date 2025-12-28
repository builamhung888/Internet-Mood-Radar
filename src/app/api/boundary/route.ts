import { NextRequest, NextResponse } from 'next/server';
import { getCountryBoundary } from '@/lib/country-boundary';

/**
 * GET /api/boundary?country=israel
 *
 * Returns GeoJSON boundary data for a country using Natural Earth data.
 * Data is cached in the database for 30 days.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const country = searchParams.get('country');

  if (!country) {
    return NextResponse.json(
      { error: 'Missing country parameter' },
      { status: 400 }
    );
  }

  try {
    const boundary = await getCountryBoundary(country);

    if (!boundary) {
      return NextResponse.json(
        { error: `Boundary not found for: ${country}` },
        { status: 404 }
      );
    }

    return NextResponse.json(boundary, {
      headers: {
        // Disable caching during development to ensure fresh data
        // In production, CDN caching handles this efficiently
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[API/BOUNDARY] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch boundary data' },
      { status: 500 }
    );
  }
}
