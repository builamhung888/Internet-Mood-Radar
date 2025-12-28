/**
 * Diagnostic script to check US boundary data structure
 * Run with: npx ts-node scripts/check-us-boundary.ts
 */

async function checkUSBoundary() {
  console.log('Checking US boundary data...\n');

  try {
    const response = await fetch('http://localhost:3000/api/boundary?country=United%20States');
    if (!response.ok) {
      console.error('Failed to fetch:', response.status);
      return;
    }

    const data = await response.json();

    console.log('=== US Boundary Structure ===');
    console.log('Type:', data.type);
    console.log('Features count:', data.features?.length);

    if (data.features?.[0]) {
      const feature = data.features[0];
      console.log('\n=== First Feature ===');
      console.log('Type:', feature.type);
      console.log('Properties:', JSON.stringify(feature.properties, null, 2));
      console.log('Geometry type:', feature.geometry?.type);

      if (feature.geometry?.type === 'MultiPolygon') {
        const coords = feature.geometry.coordinates;
        console.log('Polygon count:', coords.length);

        // Count total points
        let totalPoints = 0;
        for (const polygon of coords) {
          for (const ring of polygon) {
            totalPoints += ring.length;
          }
        }
        console.log('Total coordinate points:', totalPoints);

        // Check first few coordinates are valid
        console.log('\nFirst polygon, first ring, first 3 points:');
        const firstRing = coords[0]?.[0];
        if (firstRing) {
          for (let i = 0; i < Math.min(3, firstRing.length); i++) {
            const [lng, lat] = firstRing[i];
            console.log(`  Point ${i}: [${lng}, ${lat}] - lng in range: ${lng >= -180 && lng <= 180}, lat in range: ${lat >= -90 && lat <= 90}`);
          }
        }
      } else if (feature.geometry?.type === 'Polygon') {
        const coords = feature.geometry.coordinates;
        console.log('Ring count:', coords.length);
        let totalPoints = 0;
        for (const ring of coords) {
          totalPoints += ring.length;
        }
        console.log('Total coordinate points:', totalPoints);
      }
    }

    // Check if the data is valid GeoJSON
    console.log('\n=== Validation ===');
    const isValidType = data.type === 'FeatureCollection';
    const hasFeatures = Array.isArray(data.features) && data.features.length > 0;
    const firstFeatureValid = data.features?.[0]?.type === 'Feature';
    const hasGeometry = !!data.features?.[0]?.geometry;
    const hasProperties = !!data.features?.[0]?.properties;

    console.log('Valid FeatureCollection:', isValidType);
    console.log('Has features array:', hasFeatures);
    console.log('First feature is Feature:', firstFeatureValid);
    console.log('Has geometry:', hasGeometry);
    console.log('Has properties:', hasProperties);
    console.log('Properties.id exists:', !!data.features?.[0]?.properties?.id);
    console.log('Properties.name exists:', !!data.features?.[0]?.properties?.name);

    // Calculate data size
    const jsonSize = JSON.stringify(data).length;
    console.log(`\nJSON size: ${(jsonSize / 1024).toFixed(1)} KB`);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkUSBoundary();
