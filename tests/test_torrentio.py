"""
Tests for Torrentio URL-building logic (mirrors frontend/src/api/torrentio.js).
Run with: python3 tests/test_torrentio.py
"""

import unittest
from unittest.mock import patch, MagicMock


# ── Replicated logic from frontend/src/api/torrentio.js ──────────────────────

class InvalidParametersError(Exception):
    pass


class MissingIdError(Exception):
    pass


def build_torrentio_url(type_, external_id, season=None, episode=None, absolute_episode=None):
    """Port of the URL-building part of getTorrentioStreams()"""
    if not external_id:
        raise MissingIdError('ID is required for Torrentio streams.')

    if type_ == 'movie':
        return f'https://torrentio.strem.fun/stream/movie/{external_id}.json'
    elif type_ == 'tv' and season and episode:
        return f'https://torrentio.strem.fun/stream/series/{external_id}:{season}:{episode}.json'
    elif type_ == 'anime':
        ep = absolute_episode or 1
        return f'https://torrentio.strem.fun/stream/anime/kitsu:{external_id}:{ep}.json'
    else:
        raise InvalidParametersError('Invalid parameters for Torrentio streams.')


def get_torrentio_streams(type_, external_id, season=None, episode=None, absolute_episode=None,
                          fetch_fn=None):
    """
    Port of getTorrentioStreams() — fetch_fn injected for testing
    (replaces the JS global fetch).
    """
    url = build_torrentio_url(type_, external_id, season, episode, absolute_episode)

    try:
        response = fetch_fn(url)
        if not response.get('ok'):
            raise Exception('Torrentio API error')
        return response.get('data', {}).get('streams', [])
    except (InvalidParametersError, MissingIdError):
        raise
    except Exception:
        return []


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestBuildTorrentioUrl(unittest.TestCase):

    def test_movie_url(self):
        url = build_torrentio_url('movie', 'tt1234567')
        self.assertEqual(url, 'https://torrentio.strem.fun/stream/movie/tt1234567.json')

    def test_tv_url(self):
        url = build_torrentio_url('tv', 'tt9876543', season=2, episode=5)
        self.assertEqual(url, 'https://torrentio.strem.fun/stream/series/tt9876543:2:5.json')

    def test_anime_url_with_absolute_episode(self):
        url = build_torrentio_url('anime', '12345', absolute_episode=7)
        self.assertEqual(url, 'https://torrentio.strem.fun/stream/anime/kitsu:12345:7.json')

    def test_anime_url_defaults_to_episode_1(self):
        url = build_torrentio_url('anime', '12345')
        self.assertEqual(url, 'https://torrentio.strem.fun/stream/anime/kitsu:12345:1.json')

    def test_raises_when_id_is_none(self):
        with self.assertRaises(MissingIdError):
            build_torrentio_url('movie', None)

    def test_raises_when_id_is_empty_string(self):
        with self.assertRaises(MissingIdError):
            build_torrentio_url('movie', '')

    def test_raises_for_tv_without_season_episode(self):
        with self.assertRaises(InvalidParametersError):
            build_torrentio_url('tv', 'tt123')

    def test_raises_for_unknown_type(self):
        with self.assertRaises(InvalidParametersError):
            build_torrentio_url('unknown', 'id123')


class TestGetTorrentioStreams(unittest.TestCase):

    def _make_fetch(self, ok=True, streams=None, raise_exc=None):
        def fetch_fn(url):
            if raise_exc:
                raise raise_exc
            return {'ok': ok, 'data': {'streams': streams or []}}
        return fetch_fn

    def test_returns_streams_on_success(self):
        mock_streams = [
            {'title': '1080p BluRay.mp4', 'infoHash': 'abc123'},
            {'title': '720p WEB.mkv', 'infoHash': 'def456'},
        ]
        result = get_torrentio_streams('movie', 'tt1234567',
                                       fetch_fn=self._make_fetch(streams=mock_streams))
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['infoHash'], 'abc123')

    def test_returns_empty_list_on_api_error(self):
        result = get_torrentio_streams('movie', 'tt000',
                                       fetch_fn=self._make_fetch(ok=False))
        self.assertEqual(result, [])

    def test_returns_empty_list_on_network_exception(self):
        result = get_torrentio_streams('movie', 'tt000',
                                       fetch_fn=self._make_fetch(raise_exc=ConnectionError('timeout')))
        self.assertEqual(result, [])

    def test_returns_empty_list_when_no_streams_field(self):
        def fetch_fn(url):
            return {'ok': True, 'data': {}}
        result = get_torrentio_streams('movie', 'tt111', fetch_fn=fetch_fn)
        self.assertEqual(result, [])

    def test_raises_missing_id_not_swallowed(self):
        with self.assertRaises(MissingIdError):
            get_torrentio_streams('movie', None, fetch_fn=self._make_fetch())

    def test_raises_invalid_params_not_swallowed(self):
        with self.assertRaises(InvalidParametersError):
            get_torrentio_streams('tv', 'tt123', fetch_fn=self._make_fetch())


if __name__ == '__main__':
    unittest.main(verbosity=2)
