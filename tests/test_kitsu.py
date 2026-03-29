"""
Tests for Kitsu data-normalisation logic (mirrors frontend/src/api/kitsu.js).
Run with: python3 tests/test_kitsu.py
"""

import unittest
from datetime import datetime


# ── Replicated logic from frontend/src/api/kitsu.js ──────────────────────────

def normalize_anime(item):
    """Port of normalizeAnime()"""
    attrs = item.get('attributes', {})
    titles = attrs.get('titles', {})
    poster = attrs.get('posterImage', {})
    average_rating = attrs.get('averageRating')
    status = attrs.get('status')
    start_date_str = attrs.get('startDate')

    return {
        'id': item.get('id'),
        'title': {
            'english': titles.get('en') or attrs.get('canonicalTitle') or None,
            'romaji':  titles.get('en_jp') or titles.get('ja_jp') or None,
        },
        'coverImage': {
            'large': poster.get('large') or poster.get('original') or None,
        },
        'bannerImage': (attrs.get('coverImage') or {}).get('original') or
                       (attrs.get('coverImage') or {}).get('large') or None,
        'description': attrs.get('synopsis') or None,
        'episodes': attrs.get('episodeCount') or None,
        'averageScore': round(float(average_rating)) if average_rating else None,
        'status': (status[0].upper() + status[1:]) if status else None,
        'format': attrs.get('subtype') or None,
        'startDate': {'year': datetime.fromisoformat(start_date_str).year}
                     if start_date_str else None,
        'genres': [],
        'studios': {'nodes': []},
        'nextAiringEpisode': None,
        'trailer': None,
    }


def normalize_episode(ep):
    """Port of getKitsuEpisodes() map callback"""
    attrs = ep.get('attributes', {})
    number = attrs.get('number')
    return {
        'id': ep.get('id'),
        'number': number,
        'title': attrs.get('canonicalTitle') or f'Episode {number}',
        'isFiller': False,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_item(id='1', **attr_overrides):
    attrs = {
        'canonicalTitle': 'Test Anime',
        'titles': {'en': 'Test Anime EN', 'en_jp': 'Test Anime JP'},
        'synopsis': 'A test synopsis.',
        'posterImage': {'large': 'https://cdn.kitsu.io/poster.jpg',
                        'original': 'https://cdn.kitsu.io/orig.jpg'},
        'coverImage': {'large': 'https://cdn.kitsu.io/cover.jpg'},
        'episodeCount': 12,
        'averageRating': '80.00',
        'status': 'finished',
        'subtype': 'TV',
        'startDate': '2020-01-01',
    }
    attrs.update(attr_overrides)
    return {'id': id, 'attributes': attrs}


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestNormalizeAnime(unittest.TestCase):

    def test_basic_fields_mapped_correctly(self):
        result = normalize_anime(make_item('42'))
        self.assertEqual(result['id'], '42')
        self.assertEqual(result['title']['english'], 'Test Anime EN')
        self.assertEqual(result['title']['romaji'], 'Test Anime JP')
        self.assertEqual(result['coverImage']['large'], 'https://cdn.kitsu.io/poster.jpg')
        self.assertEqual(result['episodes'], 12)
        self.assertEqual(result['averageScore'], 80)
        self.assertEqual(result['status'], 'Finished')
        self.assertEqual(result['format'], 'TV')
        self.assertEqual(result['startDate'], {'year': 2020})

    def test_english_title_falls_back_to_canonical(self):
        item = make_item(titles={'en_jp': 'Romaji Title'}, canonicalTitle='Canonical')
        result = normalize_anime(item)
        self.assertEqual(result['title']['english'], 'Canonical')
        self.assertEqual(result['title']['romaji'], 'Romaji Title')

    def test_cover_image_falls_back_to_original(self):
        item = make_item(posterImage={'original': 'https://cdn.kitsu.io/orig.jpg'})
        result = normalize_anime(item)
        self.assertEqual(result['coverImage']['large'], 'https://cdn.kitsu.io/orig.jpg')

    def test_missing_average_rating_returns_none(self):
        item = make_item(averageRating=None)
        result = normalize_anime(item)
        self.assertIsNone(result['averageScore'])

    def test_missing_status_returns_none(self):
        item = make_item(status=None)
        result = normalize_anime(item)
        self.assertIsNone(result['status'])

    def test_status_is_capitalised(self):
        item = make_item(status='current')
        result = normalize_anime(item)
        self.assertEqual(result['status'], 'Current')

    def test_missing_start_date_returns_none(self):
        item = make_item(startDate=None)
        result = normalize_anime(item)
        self.assertIsNone(result['startDate'])

    def test_start_date_year_extracted(self):
        item = make_item(startDate='2023-10-06')
        result = normalize_anime(item)
        self.assertEqual(result['startDate']['year'], 2023)

    def test_average_score_rounded(self):
        item = make_item(averageRating='80.64')
        result = normalize_anime(item)
        self.assertEqual(result['averageScore'], 81)

    def test_empty_genres_and_studios(self):
        result = normalize_anime(make_item())
        self.assertEqual(result['genres'], [])
        self.assertEqual(result['studios'], {'nodes': []})

    def test_missing_episode_count_returns_none(self):
        item = make_item(episodeCount=None)
        result = normalize_anime(item)
        self.assertIsNone(result['episodes'])

    def test_synopsis_mapped_to_description(self):
        result = normalize_anime(make_item())
        self.assertEqual(result['description'], 'A test synopsis.')


class TestNormalizeEpisode(unittest.TestCase):

    def test_episode_with_title(self):
        ep = {'id': 'e1', 'attributes': {'number': 1, 'canonicalTitle': 'Pilot'}}
        result = normalize_episode(ep)
        self.assertEqual(result, {'id': 'e1', 'number': 1, 'title': 'Pilot', 'isFiller': False})

    def test_episode_without_title_falls_back(self):
        ep = {'id': 'e2', 'attributes': {'number': 2, 'canonicalTitle': None}}
        result = normalize_episode(ep)
        self.assertEqual(result['title'], 'Episode 2')

    def test_is_filler_always_false(self):
        ep = {'id': 'e3', 'attributes': {'number': 3, 'canonicalTitle': 'Test'}}
        self.assertFalse(normalize_episode(ep)['isFiller'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
