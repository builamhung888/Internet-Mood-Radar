import { NextResponse } from 'next/server';
import { getSourceHealth, getSystemHealth } from '@/lib/health';
import { getLLMStatus } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [sources, system, llm] = await Promise.all([
      getSourceHealth(),
      getSystemHealth(),
      Promise.resolve(getLLMStatus()),
    ]);

    return NextResponse.json({
      system,
      llm,
      sources,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get health status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
