const BLOOM_BASE = 'https://www.trybloom.ai/api/v1';

export interface Brand {
  id: string;
  name: string;
  url: string;
  status: string;
}

export interface GeneratedImage {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  url?: string;
}

type FetchOptions = RequestInit & { headers?: Record<string, string> };

async function fetchBloom<T>(
  path: string,
  apiKey: string,
  options: FetchOptions = {}
): Promise<T> {
  const res = await fetch(`${BLOOM_BASE}${path}`, {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message =
      (err as { error?: { message?: string } })?.error?.message ||
      `Bloom API error: ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function validateKey(apiKey: string): Promise<boolean> {
  try {
    await fetchBloom<{ data?: Brand[] } | Brand[]>('/brands', apiKey);
    return true;
  } catch (_error) {
    return false;
  }
}

export async function listBrands(apiKey: string): Promise<Brand[]> {
  const data = await fetchBloom<{ data?: Brand[] } | Brand[]>('/brands', apiKey);
  if (Array.isArray(data)) {
    return data;
  }
  return data.data || [];
}

export async function onboardBrand(apiKey: string, url: string): Promise<Brand> {
  return fetchBloom<Brand>('/brands', apiKey, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function getBrand(apiKey: string, brandId: string): Promise<Brand> {
  return fetchBloom<Brand>(`/brands/${brandId}`, apiKey);
}

export async function generateImages(
  apiKey: string,
  brandId: string,
  prompt: string,
  variants: number,
  aspectRatio: string
): Promise<GeneratedImage[]> {
  const data = await fetchBloom<{ images?: GeneratedImage[] } | GeneratedImage[]>(
    '/images/generate',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        brandId,
        prompt,
        variants,
        aspectRatio,
      }),
    }
  );
  if (Array.isArray(data)) {
    return data;
  }
  return data.images || [];
}

export async function getImage(apiKey: string, imageId: string): Promise<GeneratedImage> {
  return fetchBloom<GeneratedImage>(`/images/${imageId}`, apiKey);
}

export async function pollImages(
  apiKey: string,
  imageIds: string[],
  onProgress: (pct: number) => void
): Promise<GeneratedImage[]> {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const results = await Promise.all(imageIds.map((imageId) => getImage(apiKey, imageId)));
    const settled = results.filter((img) => img.status === 'completed' || img.status === 'failed');
    const pct = Math.round((settled.length / imageIds.length) * 100);
    onProgress(pct);

    if (settled.length === imageIds.length) {
      return results;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Timed out while waiting for image generation');
}

export async function editImage(
  apiKey: string,
  imageId: string,
  instruction: string
): Promise<GeneratedImage> {
  return fetchBloom<GeneratedImage>(`/images/${imageId}/edit`, apiKey, {
    method: 'POST',
    body: JSON.stringify({ instruction }),
  });
}

export async function checkCredits(apiKey: string): Promise<number> {
  const data = await fetchBloom<{ credits?: number; remaining?: number }>('/account/credits', apiKey);
  return data.credits ?? data.remaining ?? 0;
}
