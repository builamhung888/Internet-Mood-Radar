import { NextResponse } from 'next/server';
import { getSettings, updateSettings, validateSettings, AppSettings } from '@/lib/settings';

/**
 * GET /api/settings
 * Returns current app settings
 */
export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[API/SETTINGS] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings
 * Update app settings (partial update supported)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<AppSettings>;

    // Validate input
    const validation = validateSettings(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid settings', details: validation.errors },
        { status: 400 }
      );
    }

    // Update settings
    const updated = await updateSettings(body);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[API/SETTINGS] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
