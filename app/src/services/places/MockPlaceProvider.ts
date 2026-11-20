import type { Place, Region } from '../../domain/types';
import type { PlaceProvider } from './PlaceProvider';
import { PLACES, REGIONS } from './mockData';

export class MockPlaceProvider implements PlaceProvider {
  readonly name = 'mock';

  constructor(
    private readonly regions: Region[] = REGIONS,
    private readonly places: Place[] = PLACES,
  ) {}

  async listRegions(): Promise<Region[]> {
    return this.regions;
  }

  async listPlaces(regionId: string): Promise<Place[]> {
    return this.places.filter((p) => p.regionId === regionId);
  }

  async searchPlaces(query: string, regionId?: string): Promise<Place[]> {
    const q = query.trim().toLowerCase();
    const pool = regionId ? this.places.filter((p) => p.regionId === regionId) : this.places;
    if (!q) return pool;
    return pool.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q)),
    );
  }
}
