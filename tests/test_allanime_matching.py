"""
Tests for AllAnime show-matching logic (mirrors frontend/src/api/allanime.js pickBestShow).
Run with: python3 tests/test_allanime_matching.py
"""

import re
import unittest


def normalise(s):
    s = s.lower()
    s = re.sub(r'[^\w\s]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def pick_best_show(shows, search_title):
    """Port of pickBestShow from frontend/src/api/allanime.js"""
    if not shows:
        return None
    search_words = normalise(search_title).split()
    scored = []
    for s in shows:
        norm_name = normalise(s.get('englishName') or s.get('name') or '')
        match_count = sum(1 for w in search_words if w in norm_name)
        extra_words = len(norm_name.split()) - len(search_words)
        score = match_count - max(0, extra_words) * 0.5
        scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    return scored[0][1]


FRIEREN_SHOWS = [
    {'_id': 'qpeexkeTa7DzLjRnp', 'name': 'Sousou no Frieren Season 2',       'englishName': "Frieren: Beyond Journey's End Season 2"},
    {'_id': 'sG52nbcFo3PfLg6PD', 'name': 'Sousou no Frieren: no Mahou',      'englishName': "Frieren: Beyond Journey's End Mini Anime"},
    {'_id': 'mKdCCBKYRZ6ygF2co', 'name': 'Sousou no Frieren no Mahou Part 2','englishName': None},
    {'_id': 'ReHMC7TQnch3C6z8j', 'name': 'Sousou no Frieren',                'englishName': "Frieren: Beyond Journey's End"},
]

OSHI_SHOWS = [
    {'_id': 'inBARBpQC24H7Z6bE', 'name': 'Oshi No Ko Season 3', 'englishName': '[Oshi No Ko] Season 3'},
    {'_id': 'pxoBGA54cmpk56MLA', 'name': 'Oshi No Ko Season 2', 'englishName': '[Oshi No Ko] Season 2'},
    {'_id': 'b3u5TprKSKHBPBcor', 'name': 'Oshi No Ko',          'englishName': '[Oshi No Ko]'},
]


class TestPickBestShow(unittest.TestCase):

    def test_empty_list_returns_none(self):
        self.assertIsNone(pick_best_show([], 'Naruto'))
        self.assertIsNone(pick_best_show(None, 'Naruto'))

    def test_frieren_s1_picks_base_show(self):
        result = pick_best_show(FRIEREN_SHOWS, "Frieren: Beyond Journey's End")
        self.assertEqual(result['_id'], 'ReHMC7TQnch3C6z8j')

    def test_oshi_no_ko_s1_picks_base_show(self):
        result = pick_best_show(OSHI_SHOWS, 'Oshi no Ko')
        self.assertEqual(result['_id'], 'b3u5TprKSKHBPBcor')

    def test_oshi_no_ko_s2_picks_season_2(self):
        result = pick_best_show(OSHI_SHOWS, 'Oshi no Ko Season 2')
        self.assertEqual(result['_id'], 'pxoBGA54cmpk56MLA')

    def test_oshi_no_ko_s3_picks_season_3(self):
        result = pick_best_show(OSHI_SHOWS, 'Oshi no Ko Season 3')
        self.assertEqual(result['_id'], 'inBARBpQC24H7Z6bE')

    def test_single_result_always_returned(self):
        only = [{'_id': 'abc', 'name': 'Something', 'englishName': 'Something'}]
        self.assertEqual(pick_best_show(only, 'Anything'), only[0])

    def test_punctuation_differences_ignored(self):
        # Kitsu may strip apostrophes / punctuation from titles
        result = pick_best_show(FRIEREN_SHOWS, 'Frieren Beyond Journeys End')
        self.assertEqual(result['_id'], 'ReHMC7TQnch3C6z8j')

    def test_null_english_name_falls_back_to_name(self):
        # Shows with no englishName should still be scored via their Japanese name
        shows = [
            {'_id': 'jp_only', 'name': 'Sousou no Frieren', 'englishName': None},
            {'_id': 'with_en', 'name': 'Other Show',         'englishName': 'Other Show'},
        ]
        result = pick_best_show(shows, 'Sousou no Frieren')
        self.assertEqual(result['_id'], 'jp_only')

    def test_missing_english_name_key_falls_back_to_name(self):
        # Shows where 'englishName' key is absent entirely (not just None)
        shows = [
            {'_id': 'no_key',  'name': 'Sousou no Frieren'},
            {'_id': 'has_key', 'name': 'Other', 'englishName': 'Other'},
        ]
        result = pick_best_show(shows, 'Sousou no Frieren')
        self.assertEqual(result['_id'], 'no_key')

    def test_partial_word_match_scores_lower_than_full_match(self):
        shows = [
            {'_id': 'full',    'name': 'Naruto Shippuden',   'englishName': 'Naruto Shippuden'},
            {'_id': 'partial', 'name': 'Naruto',             'englishName': 'Naruto'},
        ]
        # Searching for full title should prefer the full match
        result = pick_best_show(shows, 'Naruto Shippuden')
        self.assertEqual(result['_id'], 'full')

    def test_extra_word_penalty_discourages_verbose_titles(self):
        shows = [
            {'_id': 'short',   'name': 'One Piece',                             'englishName': 'One Piece'},
            {'_id': 'verbose', 'name': 'One Piece: The Movie Extra Special Cut', 'englishName': 'One Piece: The Movie Extra Special Cut'},
        ]
        # Short title should win when searching plain "One Piece"
        result = pick_best_show(shows, 'One Piece')
        self.assertEqual(result['_id'], 'short')

    def test_whitespace_normalization_in_show_name(self):
        shows = [
            {'_id': 'spaces', 'name': 'Dragon  Ball   Z', 'englishName': None},
        ]
        # Multiple internal spaces collapsed — should still match
        result = pick_best_show(shows, 'Dragon Ball Z')
        self.assertIsNotNone(result)
        self.assertEqual(result['_id'], 'spaces')

    def test_score_tie_returns_first_show_in_list(self):
        # Both shows have identical normalised names → equal scores → first wins
        shows = [
            {'_id': 'first',  'name': 'Test Show', 'englishName': 'Test Show'},
            {'_id': 'second', 'name': 'Test Show', 'englishName': 'Test Show'},
        ]
        result = pick_best_show(shows, 'Test Show')
        self.assertEqual(result['_id'], 'first')

    def test_case_insensitive_matching(self):
        shows = [
            {'_id': 'upper', 'name': 'BLEACH', 'englishName': 'BLEACH'},
        ]
        result = pick_best_show(shows, 'bleach')
        self.assertEqual(result['_id'], 'upper')


if __name__ == '__main__':
    unittest.main(verbosity=2)
