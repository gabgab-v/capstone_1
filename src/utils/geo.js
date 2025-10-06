export function computeLineStringMeta(lineString) {
  if (!lineString || lineString.type !== 'LineString') {
    return null;
  }

  const coordinates = Array.isArray(lineString.coordinates) ? lineString.coordinates : [];
  if (coordinates.length === 0) {
    return null;
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  coordinates.forEach((coord) => {
    if (!Array.isArray(coord) || coord.length < 2) {
      return;
    }

    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return;
    }

    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
    return null;
  }

  const center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;
  const maxSpan = Math.max(spanLng, spanLat, 0.0001);
  const approxZoom = Math.min(15, Math.max(4, Math.log2(360 / maxSpan)));

  return {
    bounds: {
      northEast: [maxLng, maxLat],
      southWest: [minLng, minLat],
    },
    center,
    start: coordinates[0],
    end: coordinates[coordinates.length - 1],
    approxZoom,
  };
}

export function formatMetersToKm(distanceMeters) {
  const distance = Number(distanceMeters);
  if (!Number.isFinite(distance) || distance <= 0) {
    return '0.0 km';
  }
  return `${(distance / 1000).toFixed(1)} km`;
}