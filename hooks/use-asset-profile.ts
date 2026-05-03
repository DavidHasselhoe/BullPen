import { useQuery } from '@tanstack/react-query';
import type { AssetType } from '@/lib/assets/asset-type';

export interface AssetProfile {
  symbol: string;
  slug: string;
  name: string;
  assetType: AssetType;
  logoUrl: string | null;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  country: string | null;
  description: string | null;
  type: string | null;
}

export function useAssetProfile(slug: string) {
  return useQuery<AssetProfile>({
    queryKey: ['asset-profile', slug],
    queryFn: async () => {
      const res = await fetch(`/api/asset/${encodeURIComponent(slug)}/profile`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Profile fetch failed');
      return json as AssetProfile;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    enabled: !!slug,
  });
}
