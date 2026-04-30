import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { getAnimeKitsuInfo, getKitsuEpisodes, searchAnimeKitsu } from '../api/kitsu';
import { getAnimeById, getStudioByTitle } from '../api/anilist';
import { useAuth } from '../hooks/useAuth';
import { useWatchlist } from '../hooks/useWatchlist';
import { auth } from '../firebase';
import LoadingSpinner from '../components/LoadingSpinner';
import EpisodeList from '../components/EpisodeList';

export default function AnimeDetailPage() {
  const { kitsuId } = useParams();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId');
  const titleHint = searchParams.get('title');
  const source = searchParams.get('source');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isInWatchlist, toggleWatchlist } = useWatchlist(user?.uid);

  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [staleLink, setStaleLink] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [studio, setStudio] = useState(null);

  async function handleWatchParty(epNum) {
    if (!user || isCreatingRoom) return;
    setIsCreatingRoom(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: `${user.displayName}'s Room`,
          contentId: kitsuId,
          contentType: 'anime',
          contentTitle: anime?.title?.english || anime?.title?.romaji || '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/watch?type=anime&kitsuId=${kitsuId}&epNum=${epNum}&roomId=${data.id}`);
      }
    } catch (err) {
      console.error(err);
    }
    setIsCreatingRoom(false);
  }

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      // ID is from AniList — skip the Kitsu ID lookup and search by title directly
      if (source === 'anilist' && titleHint) {
        const results = await searchAnimeKitsu(titleHint).catch(() => []);
        const normalized = str => str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        const hintWords = normalized(titleHint).split(/\s+/).filter(w => w.length > 3);
        // Extract season number from the hint (e.g. "Season 4" → "4")
        const hintSeason = titleHint.match(/(?:season|s)\s*(\d+)/i)?.[1] ?? null;
        const match = results.find(r => {
          const candidate = normalized([r.title?.english, r.title?.romaji].filter(Boolean).join(' '));
          // Require ≥80% of hint words to appear in the candidate
          const wordHits = hintWords.filter(w => candidate.includes(w)).length;
          if (wordHits < Math.ceil(hintWords.length * 0.8)) return false;
          // If the search title has a season number, the candidate must match it exactly
          if (hintSeason) {
            const candidateSeason = candidate.match(/(?:season|s)\s*(\d+)/i)?.[1] ?? null;
            return candidateSeason === hintSeason;
          }
          return true;
        });
        if (match) {
          const qs = new URLSearchParams();
          if (roomId) qs.set('roomId', roomId);
          qs.set('title', titleHint);
          navigate(`/anime/${match.id}?${qs.toString()}`, { replace: true });
          return;
        }
        // Kitsu doesn't have it yet — fall back to AniList data using the AniList ID
        try {
          const anilistData = await getAnimeById(kitsuId);
          if (anilistData) {
            setAnime(anilistData);
            setStudio(anilistData.studios?.nodes?.[0]?.name || null);
            const count = anilistData.episodes || 1;
            setEpisodes(Array.from({ length: count }, (_, i) => ({
              id: `${i + 1}`, number: i + 1, title: `Episode ${i + 1}`, isFiller: false,
            })));
            setLoading(false);
            return;
          }
        } catch { /* fall through to stale link */ }
        setStaleLink(true);
        setLoading(false);
        return;
      }

      try {
        const [animeData, eps] = await Promise.all([
          getAnimeKitsuInfo(kitsuId),
          getKitsuEpisodes(kitsuId),
        ]);
        setAnime(animeData);
        const title = animeData.title?.english || animeData.title?.romaji;
        if (title) getStudioByTitle(title).then(s => setStudio(s)).catch(() => {});

        if (eps.length > 0) {
          setEpisodes(eps);
        } else {
          // Fallback: generate episode stubs from the episode count
          const count = animeData.episodes || 1;
          setEpisodes(Array.from({ length: count }, (_, i) => ({
            id: `${i + 1}`,
            number: i + 1,
            title: `Episode ${i + 1}`,
            isFiller: false,
          })));
        }
      } catch (err) {
        console.error(err);
        if (err.status === 404) {
          // Try to recover: use ?title= hint first, then fall back to room's contentTitle
          let recoveryTitle = titleHint?.trim() || null;

          if (!recoveryTitle && roomId) {
            try {
              const token = await auth.currentUser?.getIdToken();
              const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/rooms/${roomId}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (res.ok) {
                const roomData = await res.json();
                recoveryTitle = roomData.contentTitle
                  ?.replace(/\s*—\s*Episode\s*\d+.*$/i, '')
                  .trim() || null;
              }
            } catch { /* fall through to staleLink */ }
          }

          if (recoveryTitle) {
            const results = await searchAnimeKitsu(recoveryTitle).catch(() => []);
            if (results.length > 0) {
              const newId = results[0].id;
              const qs = new URLSearchParams();
              if (roomId) qs.set('roomId', roomId);
              qs.set('title', recoveryTitle);
              navigate(`/anime/${newId}?${qs.toString()}`, { replace: true });
              return;
            }
          }

          setStaleLink(true);
        } else {
          setError('Failed to load anime details.');
        }
      }
      setLoading(false);
    };
    fetchAll();
  }, [kitsuId]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (staleLink) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="text-5xl">🔍</div>
      <h2 className="text-2xl font-bold text-primary">Anime not found in Kitsu</h2>
      <p className="text-secondary max-w-md">
        {titleHint ? (
          <><span className="font-semibold text-primary">"{titleHint}"</span> couldn't be matched in Kitsu's database — it may not be indexed yet.</>
        ) : 'This anime ID is not valid or has moved.'}
      </p>
      <Link
        to={titleHint ? `/anime?search=${encodeURIComponent(titleHint)}` : '/anime'}
        className="mt-2 px-6 py-2.5 bg-accent-teal text-white rounded-lg font-bold shadow hover:opacity-90 transition"
      >
        Search for it manually
      </Link>
    </div>
  );
  if (!anime) return <div className="p-8 text-center text-red-500 font-bold">Failed to load content.</div>;

  const inWatchlist = isInWatchlist(kitsuId);
  const year = anime.startDate?.year;
  const format = anime.format ? anime.format.replace(/_/g, ' ') : null;

  return (
    <div className="pb-12">
      {/* Room banner */}
      {roomId && (
        <div className="bg-accent-teal/10 border-b border-accent-teal/30 px-4 py-3 flex items-center gap-3 text-sm font-semibold text-accent-teal">
          <span>🎬</span>
          <span>You're setting up a Watch Party room. Pick an episode below to start streaming with friends.</span>
        </div>
      )}
      {/* Banner */}
      <div className="relative w-full h-[180px] sm:h-[250px] md:h-[400px] bg-primary">
        <img src={anime.bannerImage || anime.coverImage?.large} alt="Banner" className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-page via-page/60 to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-16 sm:-mt-24 md:-mt-32 relative z-10">
        {/* Hero card */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 bg-surface p-4 sm:p-6 rounded-2xl shadow-xl border border-border">
          <div className="w-28 sm:w-40 md:w-64 shrink-0 mx-auto md:mx-0">
            <img src={anime.coverImage?.large} alt="Poster" className="w-full rounded-xl shadow-lg border border-border-subtle" />
          </div>

          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-primary mb-1">{anime.title.english || anime.title.romaji}</h1>
            {anime.title.romaji && anime.title.english && (
              <p className="text-muted font-semibold text-sm mb-1">{anime.title.romaji}</p>
            )}

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="bg-accent-teal text-white px-2.5 py-1 rounded text-sm font-bold shadow-sm">{anime.status}</span>
              {format && <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold capitalize">{format}</span>}
              {year && <span className="bg-surface-raised border border-border text-secondary px-2.5 py-1 rounded text-sm font-semibold">{year}</span>}
              {anime.averageScore && (
                <span className="text-amber-500 font-bold bg-amber-50 px-2.5 py-1 border border-amber-200 rounded">
                  ★ {(anime.averageScore / 10).toFixed(1)}
                </span>
              )}
              <span className="text-secondary font-medium text-sm">{anime.episodes ? `${anime.episodes} Episodes` : 'Ongoing'}</span>
            </div>

            <p className="text-secondary leading-relaxed mb-6 max-w-3xl font-medium text-sm sm:text-base line-clamp-4 sm:line-clamp-none"
              dangerouslySetInnerHTML={{ __html: anime.description }} />

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => toggleWatchlist({
                  contentId: kitsuId, contentType: 'anime',
                  title: anime.title.english || anime.title.romaji,
                  posterUrl: anime.coverImage?.large
                })}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold shadow-md transition-transform hover:scale-105 border ${inWatchlist ? 'bg-surface border-border text-red-600' : 'bg-surface-raised border-border text-primary'}`}
              >
                <span className="text-xl">{inWatchlist ? '♥️' : '♡'}</span>
                {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              </button>

              {!roomId && user && (
                <button
                  onClick={() => handleWatchParty(episodes[0]?.number || 1)}
                  disabled={isCreatingRoom}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold shadow-md transition-transform hover:scale-105 border bg-accent-teal text-white border-accent-teal hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <span className="text-xl">🎬</span>
                  {isCreatingRoom ? 'Creating...' : 'Start Watch Party'}
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-8 bg-amber-50 border-l-4 border-amber-500 text-amber-800 p-4 rounded shadow-sm font-medium">
            <strong>Notice:</strong> {error}
          </div>
        )}

        {/* Content grid */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-8">
            {!error && <EpisodeList episodes={episodes} animeId={kitsuId} roomId={roomId} onWatchParty={user ? handleWatchParty : null} user={user} animeTitle={anime?.title?.english || anime?.title?.romaji} posterUrl={anime?.coverImage?.large} />}
          </div>

          {/* Info sidebar */}
          <div className="bg-surface rounded-xl p-6 border border-border shadow-sm h-fit">
            <h3 className="font-bold text-primary text-xl mb-4 border-b border-border pb-2">Information</h3>
            <div className="space-y-4 text-sm">
              {format && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Format</p>
                  <p className="text-primary font-medium capitalize">{format}</p>
                </div>
              )}
              {year && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Year</p>
                  <p className="text-primary font-medium">{year}</p>
                </div>
              )}
              <div>
                <p className="text-muted font-semibold uppercase tracking-wider mb-1">Status</p>
                <p className="text-primary font-medium">{anime.status}</p>
              </div>
              {anime.episodes && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Episodes</p>
                  <p className="text-primary font-medium">{anime.episodes}</p>
                </div>
              )}
              {studio && (
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wider mb-1">Studio</p>
                  <p className="text-primary font-medium">{studio}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
