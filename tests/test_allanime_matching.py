"""
Tests for GogoAnime show-matching logic (mirrors frontend/src/api/gogoanime.js pickBestShow).
Run with: python3 tests/test_allanime_matching.py
"""

import re
import unittest


def normalise(s):
    s = s.lower()
    s = re.sub(r'[^\w\s]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def is_dub(show):
    return bool(
        re.search(r'\bdub\b', show.get('title', ''), re.IGNORECASE) or
        re.search(r'-dub$', show.get('slug', ''))
    )


def pick_best_show(shows, search_title):
    """Port of pickBestShow from frontend/src/api/gogoanime.js"""
    if not shows:
        return None
    search_norm = normalise(search_title)
    search_compact = search_norm.replace(' ', '')
    search_words = [w for w in search_norm.split() if w]
    scored = []
    for s in shows:
        norm_name = normalise(s.get('title') or '')
        norm_compact = norm_name.replace(' ', '')
        match_count = sum(1 for w in search_words if w in norm_name)
        extra_words = len([w for w in norm_name.split() if w]) - len(search_words)
        dub_penalty = 100 if is_dub(s) else 0
        compact_bonus = 3 if (search_compact and norm_compact == search_compact) else 0
        score = match_count - max(0, extra_words) * 0.5 - dub_penalty + compact_bonus
        scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    return scored[0][1] if scored[0][0] > 0 else None


FRIEREN_SHOWS = [
    {'slug': 'sousou-no-frieren-season-2', 'title': "Frieren: Beyond Journey's End Season 2"},
    {'slug': 'sousou-no-frieren-mini',     'title': "Frieren: Beyond Journey's End Mini Anime"},
    {'slug': 'sousou-no-frieren-mini-2',   'title': 'Sousou no Frieren no Mahou Part 2'},
    {'slug': 'sousou-no-frieren',          'title': "Frieren: Beyond Journey's End"},
]

OSHI_SHOWS = [
    {'slug': 'oshi-no-ko-season-3', 'title': '[Oshi No Ko] Season 3'},
    {'slug': 'oshi-no-ko-season-2', 'title': '[Oshi No Ko] Season 2'},
    {'slug': 'oshi-no-ko',          'title': '[Oshi No Ko]'},
]

DUB_MIXED_SHOWS = [
    {'slug': 'naruto-dub',          'title': 'Naruto (Dub)'},
    {'slug': 'naruto',              'title': 'Naruto'},
    {'slug': 'naruto-shippuden-dub','title': 'Naruto: Shippuden (Dub)'},
]


class TestPickBestShow(unittest.TestCase):

    def test_empty_list_returns_none(self):
        self.assertIsNone(pick_best_show([], 'Naruto'))
        self.assertIsNone(pick_best_show(None, 'Naruto'))

    def test_frieren_s1_picks_base_show(self):
        result = pick_best_show(FRIEREN_SHOWS, "Frieren: Beyond Journey's End")
        self.assertEqual(result['slug'], 'sousou-no-frieren')

    def test_oshi_no_ko_s1_picks_base_show(self):
        result = pick_best_show(OSHI_SHOWS, 'Oshi no Ko')
        self.assertEqual(result['slug'], 'oshi-no-ko')

    def test_oshi_no_ko_s2_picks_season_2(self):
        result = pick_best_show(OSHI_SHOWS, 'Oshi no Ko Season 2')
        self.assertEqual(result['slug'], 'oshi-no-ko-season-2')

    def test_oshi_no_ko_s3_picks_season_3(self):
        result = pick_best_show(OSHI_SHOWS, 'Oshi no Ko Season 3')
        self.assertEqual(result['slug'], 'oshi-no-ko-season-3')

    def test_returns_none_when_no_confident_match(self):
        unrelated = [
            {'slug': 'dragon-ball-z', 'title': 'Dragon Ball Z'},
            {'slug': 'one-piece',     'title': 'One Piece'},
        ]
        self.assertIsNone(pick_best_show(unrelated, 'Naruto'))

    def test_punctuation_differences_ignored(self):
        result = pick_best_show(FRIEREN_SHOWS, 'Frieren Beyond Journeys End')
        self.assertEqual(result['slug'], 'sousou-no-frieren')

    def test_prefers_sub_over_dub(self):
        result = pick_best_show(DUB_MIXED_SHOWS, 'Naruto')
        self.assertEqual(result['slug'], 'naruto')

    def test_prefers_sub_even_when_dub_listed_first(self):
        reversed_shows = list(reversed(DUB_MIXED_SHOWS))
        result = pick_best_show(reversed_shows, 'Naruto')
        self.assertEqual(result['slug'], 'naruto')

    def test_only_dub_available_returns_none(self):
        dub_only = [{'slug': 'one-piece-dub', 'title': 'One Piece (Dub)'}]
        self.assertIsNone(pick_best_show(dub_only, 'One Piece'))

    def test_compact_match_handles_no_space_title(self):
        # AniList may store "MARRIAGETOXIN" (one word), GogoAnime has "Marriage Toxin" (two words)
        shows = [
            {'slug': 'some-romance-show', 'title': 'My Lovely Marriage'},
            {'slug': 'marriage-toxin',    'title': 'Marriage Toxin'},
        ]
        self.assertEqual(pick_best_show(shows, 'MARRIAGETOXIN')['slug'], 'marriage-toxin')

    def test_compact_match_beats_unrelated_first_result(self):
        shows = [
            {'slug': 'random-show',   'title': 'Random Show'},
            {'slug': 'marriage-toxin','title': 'Marriage Toxin'},
        ]
        self.assertEqual(pick_best_show(shows, 'MARRIAGETOXIN')['slug'], 'marriage-toxin')

    def test_partial_word_match_scores_lower_than_full_match(self):
        shows = [
            {'slug': 'naruto-shippuden', 'title': 'Naruto Shippuden'},
            {'slug': 'naruto',           'title': 'Naruto'},
        ]
        result = pick_best_show(shows, 'Naruto Shippuden')
        self.assertEqual(result['slug'], 'naruto-shippuden')

    def test_extra_word_penalty_discourages_verbose_titles(self):
        shows = [
            {'slug': 'one-piece',         'title': 'One Piece'},
            {'slug': 'one-piece-verbose', 'title': 'One Piece: The Movie Extra Special Cut'},
        ]
        result = pick_best_show(shows, 'One Piece')
        self.assertEqual(result['slug'], 'one-piece')

    def test_whitespace_normalization_in_show_name(self):
        shows = [{'slug': 'dbz', 'title': 'Dragon  Ball   Z'}]
        result = pick_best_show(shows, 'Dragon Ball Z')
        self.assertIsNotNone(result)
        self.assertEqual(result['slug'], 'dbz')

    def test_score_tie_returns_first_show_in_list(self):
        shows = [
            {'slug': 'first',  'title': 'Test Show'},
            {'slug': 'second', 'title': 'Test Show'},
        ]
        result = pick_best_show(shows, 'Test Show')
        self.assertEqual(result['slug'], 'first')

    def test_case_insensitive_matching(self):
        shows = [{'slug': 'bleach', 'title': 'BLEACH'}]
        result = pick_best_show(shows, 'bleach')
        self.assertEqual(result['slug'], 'bleach')


if __name__ == '__main__':
    unittest.main(verbosity=2)
