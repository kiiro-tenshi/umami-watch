const ANILIST_API = 'https://graphql.anilist.co';

const gqlFetch = async (query, variables = {}) => {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`AniList HTTP error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  return json.data;
};

export const searchAniList = async (query, page = 1, perPage = 20) => {
  const gql = `query($search:String,$page:Int,$perPage:Int){
    Page(page:$page,perPage:$perPage){
      media(search:$search,type:ANIME,sort:POPULARITY_DESC){
        id title{romaji english} coverImage{large} averageScore episodes status description genres bannerImage
      }
    }
  }`;
  const data = await gqlFetch(gql, { search: query, page, perPage });
  return data.Page.media;
};

export const getTrendingAnime = async (page = 1, perPage = 20) => {
  const gql = `query($page:Int,$perPage:Int){
    Page(page:$page,perPage:$perPage){
      media(type:ANIME,sort:TRENDING_DESC){
        id title{romaji english} coverImage{large} averageScore episodes status description genres bannerImage
      }
    }
  }`;
  const data = await gqlFetch(gql, { page, perPage });
  return data.Page.media;
};

export const getAnimeById = async (id) => {
  const gql = `query($id:Int){
    Media(id:$id,type:ANIME){
      id title{romaji english} coverImage{large} bannerImage description genres averageScore episodes status
      format startDate{year} nextAiringEpisode{episode timeUntilAiring}
      trailer{id site}
      studios(isMain:true){nodes{name}}
    }
  }`;
  const data = await gqlFetch(gql, { id: parseInt(id) });
  return data.Media;
};

export const getAnimeGenres = async () => {
  const gql = `query{ GenreCollection }`;
  const data = await gqlFetch(gql);
  return data.GenreCollection;
};

export const discoverAnimeByGenre = async (genre, page = 1, perPage = 20) => {
  const gql = `query($genre:String,$page:Int,$perPage:Int){
    Page(page:$page,perPage:$perPage){
      media(genre:$genre,type:ANIME,sort:POPULARITY_DESC){
        id title{romaji english} coverImage{large} averageScore episodes status description genres bannerImage
      }
    }
  }`;
  const data = await gqlFetch(gql, { genre, page, perPage });
  return data.Page.media;
};
