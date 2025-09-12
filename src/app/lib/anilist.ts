const ANILIST_GRAPHQL = "https://graphql.anilist.co";

export type AniListMedia = {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string };
  siteUrl?: string;
  format?: string;
  status?: string;
};

export async function searchAnimeByTitle(title: string): Promise<AniListMedia[]> {
  const query = `
    query($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          title { romaji english native }
          coverImage { large }
          siteUrl
          format
          status
        }
      }
    }
  `;

  const res = await fetch(ANILIST_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables: { search: title } }),
  });

  if (!res.ok) throw new Error(`AniList error: ${res.status}`);
  const json = await res.json();
  return json?.data?.Page?.media ?? [];
}
