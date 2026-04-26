const ANILIST_API = 'https://graphql.anilist.co';

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const season =
    month <= 3 ? 'WINTER' :
    month <= 6 ? 'SPRING' :
    month <= 9 ? 'SUMMER' : 'FALL';
  return { season, year };
}

export function getCurrentSeasonLabel() {
  const { season, year } = getCurrentSeason();
  const name = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' }[season];
  return `${name} ${year}`;
}

const gqlFetch = async (query, variables = {}, retries = 2) => {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (res.status === 429 && retries > 0) {
    await new Promise(r => setTimeout(r, 1500));
    return gqlFetch(query, variables, retries - 1);
  }
  if (!res.ok) throw new Error(`AniList HTTP error: ${res.status}`);
  const json = await res.json();
  if (json.errors) {
    if (json.errors[0]?.status === 429 && retries > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return gqlFetch(query, variables, retries - 1);
    }
    throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  }
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

export const getSeasonalTrendingAnime = async (page = 1, perPage = 20) => {
  const { season, year: seasonYear } = getCurrentSeason();
  const gql = `query($page:Int,$perPage:Int,$season:MediaSeason,$seasonYear:Int){
    Page(page:$page,perPage:$perPage){
      media(type:ANIME,season:$season,seasonYear:$seasonYear,sort:TRENDING_DESC){
        id title{romaji english} coverImage{large} averageScore episodes status description genres bannerImage
      }
    }
  }`;
  const data = await gqlFetch(gql, { page, perPage, season, seasonYear });
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

export const getStudioByTitle = async (title) => {
  const gql = `query($search:String){
    Media(search:$search,type:ANIME){
      studios(isMain:true){nodes{name}}
    }
  }`;
  const data = await gqlFetch(gql, { search: title });
  return data.Media?.studios?.nodes?.[0]?.name || null;
};

export const getAnimeGenres = async () => {
  const gql = `query{ GenreCollection }`;
  const data = await gqlFetch(gql);
  return data.GenreCollection;
};

export const getWeekAiringSchedule = async (weekStart) => {
  const start = Math.floor(weekStart.getTime() / 1000);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const end = Math.floor(weekEnd.getTime() / 1000) - 1;
  const gql = `query($page:Int,$gt:Int,$lt:Int){
    Page(page:$page,perPage:50){
      pageInfo{hasNextPage}
      airingSchedules(airingAt_greater:$gt,airingAt_lesser:$lt,sort:TIME){
        airingAt episode
        media{ id title{romaji english} coverImage{large} popularity episodes }
      }
    }
  }`;
  const all = [];
  for (let page = 1; page <= 2; page++) {
    const data = await gqlFetch(gql, { page, gt: start, lt: end });
    all.push(...data.Page.airingSchedules);
    if (!data.Page.pageInfo.hasNextPage) break;
  }
  return all;
};

export function getCurrentSeasonInfo() {
  return getCurrentSeason();
}

export const browseAnime = async ({ season, year, genre, search, sort = 'TRENDING_DESC', page = 1, perPage = 24 } = {}) => {
  const gql = `query($page:Int,$perPage:Int,$sort:[MediaSort],$search:String,$season:MediaSeason,$seasonYear:Int,$genre:String){
    Page(page:$page,perPage:$perPage){
      pageInfo{hasNextPage}
      media(type:ANIME,sort:$sort,search:$search,season:$season,seasonYear:$seasonYear,genre:$genre){
        id title{romaji english} coverImage{large} averageScore episodes status genres
      }
    }
  }`;
  const variables = { page, perPage, sort: [sort] };
  if (search) variables.search = search;
  if (season) variables.season = season;
  if (year) variables.seasonYear = parseInt(year);
  if (genre) variables.genre = genre;
  const data = await gqlFetch(gql, variables);
  return { media: data.Page.media, hasNextPage: data.Page.pageInfo.hasNextPage };
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
