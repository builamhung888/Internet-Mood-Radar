/**
 * Backfill coordinates for historical items that have country but no lat/lng
 * Run with: npx ts-node scripts/backfill-coords.ts
 */

import { PrismaClient } from '@prisma/client';
import { geocode } from '../src/lib/geocoding';

const prisma = new PrismaClient();

async function backfillCoordinates() {
  console.log('[BACKFILL] Starting coordinate backfill...');

  // Find items with country but no coordinates
  const itemsToUpdate = await prisma.historicalItem.findMany({
    where: {
      country: { not: null },
      OR: [
        { lat: null },
        { lng: null },
      ],
    },
  });

  console.log(`[BACKFILL] Found ${itemsToUpdate.length} items needing coordinates`);

  // Group by country to minimize geocoding calls
  const byCountry = new Map<string, typeof itemsToUpdate>();
  for (const item of itemsToUpdate) {
    if (!item.country) continue;
    const existing = byCountry.get(item.country) || [];
    existing.push(item);
    byCountry.set(item.country, existing);
  }

  console.log(`[BACKFILL] Countries to geocode: ${Array.from(byCountry.keys()).join(', ')}`);

  let updatedCount = 0;

  for (const [country, items] of byCountry) {
    console.log(`[BACKFILL] Geocoding ${country} (${items.length} items)...`);

    // Geocode the country once
    const location = await geocode(country);

    if (!location) {
      console.log(`[BACKFILL] Could not geocode ${country}, skipping`);
      continue;
    }

    console.log(`[BACKFILL] ${country} -> lat: ${location.lat}, lng: ${location.lng}`);

    // Update all items for this country
    const result = await prisma.historicalItem.updateMany({
      where: {
        id: { in: items.map(i => i.id) },
      },
      data: {
        lat: location.lat,
        lng: location.lng,
        locationName: location.name,
      },
    });

    updatedCount += result.count;
    console.log(`[BACKFILL] Updated ${result.count} items for ${country}`);
  }

  console.log(`[BACKFILL] Complete! Updated ${updatedCount} items total`);
}

backfillCoordinates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
