"""
Tests for server-side business logic (mirrors server/middleware/requireAuth.js
and server/routes/users.js + rooms.js).
Run with: python3 tests/test_server_logic.py
"""

import unittest


# ── Replicated logic from server/middleware/requireAuth.js ───────────────────

def extract_token(headers, query_params):
    """
    Port of the token-extraction logic in requireAuth middleware.
    Returns the token string or None.
    """
    auth_header = headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[len('Bearer '):]
    return query_params.get('token') or None


def require_auth_result(headers, query_params, verify_fn):
    """
    Simulates requireAuth: returns (user_dict, None) on success
    or (None, {'status': 401, 'body': {...}}) on failure.
    verify_fn(token) -> user dict or raises
    """
    token = extract_token(headers, query_params)
    if not token:
        return None, {'status': 401, 'body': {'error': 'Unauthorized'}}
    try:
        user = verify_fn(token)
        return user, None
    except Exception as e:
        return None, {'status': 401, 'body': {'error': 'Unauthorized', 'details': str(e)}}


# ── Replicated logic from server/routes/users.js ─────────────────────────────

USERS_PATCH_ALLOWED = {'displayName', 'photoURL', 'rdApiKey'}


def filter_user_patch_fields(body):
    """Port of the field-filtering in PATCH /me"""
    return {k: v for k, v in body.items() if k in USERS_PATCH_ALLOWED}


# ── Replicated logic from server/routes/rooms.js ─────────────────────────────

ROOMS_PATCH_ALLOWED = {
    'streamUrl', 'contentId', 'contentType', 'contentTitle',
    'episodeId', 'tracks', 'magnetFileIdx',
}


def check_room_member(room_data, uid):
    """Returns True if uid is a member, False otherwise."""
    return uid in room_data.get('members', [])


def check_room_owner(room_data, uid):
    """Returns True if uid is the owner, False otherwise."""
    return room_data.get('ownerId') == uid


def validate_invite_code(invite_code):
    """
    Port of POST /join validation.
    Returns (normalised_code, None) or (None, error_dict).
    """
    if not invite_code:
        return None, {'status': 400, 'body': {'error': 'Invite code required'}}
    return invite_code.upper(), None


def filter_room_patch_fields(body):
    """Port of the field-filtering in PATCH /:roomId"""
    return {k: v for k, v in body.items() if k in ROOMS_PATCH_ALLOWED}


# ── Tests: requireAuth ────────────────────────────────────────────────────────

class TestExtractToken(unittest.TestCase):

    def test_extracts_bearer_token_from_header(self):
        token = extract_token({'authorization': 'Bearer abc123'}, {})
        self.assertEqual(token, 'abc123')

    def test_falls_back_to_query_param(self):
        token = extract_token({}, {'token': 'query-token'})
        self.assertEqual(token, 'query-token')

    def test_header_takes_priority_over_query_param(self):
        token = extract_token({'authorization': 'Bearer header-token'}, {'token': 'ignored'})
        self.assertEqual(token, 'header-token')

    def test_returns_none_when_no_token(self):
        self.assertIsNone(extract_token({}, {}))

    def test_returns_none_for_non_bearer_header(self):
        self.assertIsNone(extract_token({'authorization': 'Basic xyz'}, {}))


class TestRequireAuthResult(unittest.TestCase):

    def test_returns_user_on_valid_token(self):
        verify = lambda t: {'uid': 'user-abc', 'email': 'a@b.com'}
        user, err = require_auth_result({'authorization': 'Bearer valid'}, {}, verify)
        self.assertIsNone(err)
        self.assertEqual(user['uid'], 'user-abc')

    def test_returns_401_with_no_token(self):
        user, err = require_auth_result({}, {}, lambda t: {})
        self.assertIsNone(user)
        self.assertEqual(err['status'], 401)
        self.assertEqual(err['body']['error'], 'Unauthorized')

    def test_returns_401_when_verify_raises(self):
        def bad_verify(t):
            raise Exception('Token has been revoked')
        user, err = require_auth_result({'authorization': 'Bearer expired'}, {}, bad_verify)
        self.assertIsNone(user)
        self.assertEqual(err['status'], 401)
        self.assertIn('Token has been revoked', err['body']['details'])

    def test_accepts_token_from_query_param(self):
        verify = lambda t: {'uid': 'user-def'}
        user, err = require_auth_result({}, {'token': 'query-param-token'}, verify)
        self.assertIsNone(err)
        self.assertEqual(user['uid'], 'user-def')


# ── Tests: users PATCH field filtering ───────────────────────────────────────

class TestFilterUserPatchFields(unittest.TestCase):

    def test_keeps_allowed_fields(self):
        result = filter_user_patch_fields({'displayName': 'Bob', 'photoURL': 'https://x.com/pic.jpg'})
        self.assertEqual(result, {'displayName': 'Bob', 'photoURL': 'https://x.com/pic.jpg'})

    def test_drops_unknown_fields(self):
        result = filter_user_patch_fields({'displayName': 'Charlie', 'unknownField': 'ignored'})
        self.assertEqual(result, {'displayName': 'Charlie'})

    def test_allows_rd_api_key(self):
        result = filter_user_patch_fields({'rdApiKey': 'secret'})
        self.assertEqual(result, {'rdApiKey': 'secret'})

    def test_empty_when_no_allowed_fields(self):
        result = filter_user_patch_fields({'foo': 'bar', 'baz': 123})
        self.assertEqual(result, {})


# ── Tests: room business rules ────────────────────────────────────────────────

class TestCheckRoomMember(unittest.TestCase):

    def test_member_is_in_room(self):
        self.assertTrue(check_room_member({'members': ['uid-1', 'uid-2']}, 'uid-1'))

    def test_non_member_is_not_in_room(self):
        self.assertFalse(check_room_member({'members': ['uid-2']}, 'uid-1'))

    def test_empty_members_list(self):
        self.assertFalse(check_room_member({'members': []}, 'uid-1'))


class TestCheckRoomOwner(unittest.TestCase):

    def test_owner_matches(self):
        self.assertTrue(check_room_owner({'ownerId': 'uid-1'}, 'uid-1'))

    def test_non_owner_does_not_match(self):
        self.assertFalse(check_room_owner({'ownerId': 'uid-2'}, 'uid-1'))


class TestValidateInviteCode(unittest.TestCase):

    def test_valid_code_normalised_to_uppercase(self):
        code, err = validate_invite_code('abc123')
        self.assertIsNone(err)
        self.assertEqual(code, 'ABC123')

    def test_already_uppercase_code_unchanged(self):
        code, err = validate_invite_code('XYZ456')
        self.assertIsNone(err)
        self.assertEqual(code, 'XYZ456')

    def test_missing_code_returns_400(self):
        code, err = validate_invite_code(None)
        self.assertIsNone(code)
        self.assertEqual(err['status'], 400)

    def test_empty_string_returns_400(self):
        code, err = validate_invite_code('')
        self.assertIsNone(code)
        self.assertEqual(err['status'], 400)


class TestFilterRoomPatchFields(unittest.TestCase):

    def test_keeps_allowed_fields(self):
        body = {'streamUrl': 'https://example.com/v.mp4', 'contentType': 'movie'}
        result = filter_room_patch_fields(body)
        self.assertEqual(result, body)

    def test_drops_unknown_fields(self):
        body = {'streamUrl': 'https://x.com', 'hackField': 'bad'}
        result = filter_room_patch_fields(body)
        self.assertNotIn('hackField', result)
        self.assertIn('streamUrl', result)

    def test_magnet_file_idx_allowed(self):
        result = filter_room_patch_fields({'magnetFileIdx': 2})
        self.assertEqual(result, {'magnetFileIdx': 2})

    def test_all_allowed_fields_pass_through(self):
        body = {f: 'val' for f in ROOMS_PATCH_ALLOWED}
        result = filter_room_patch_fields(body)
        self.assertEqual(result, body)


# ── Replicated logic from server/routes/allanime.js ──────────────────────────

def decode_url(encoded):
    """
    Port of decodeUrl() from server/routes/allanime.js.
    XOR-decodes a '--<hex>' encoded URL; passes plain URLs through unchanged.
    """
    if not encoded.startswith('--'):
        return encoded
    hex_str = encoded[2:]
    chars = []
    for i in range(0, len(hex_str), 2):
        byte = int(hex_str[i:i + 2], 16) ^ 56
        chars.append(chr(byte))
    return ''.join(chars)


def xor_encode_url(url):
    """Reverse of decode_url — encodes a plain URL into the '--<hex>' format."""
    return '--' + ''.join(f'{ord(c) ^ 56:02x}' for c in url)


def process_allanime_sources(raw_sources):
    """
    Port of the source-processing pipeline in GET /api/anime/allanime/sources.
    Decodes, filters, maps type, and sorts by priority descending.
    """
    decoded = []
    for s in raw_sources:
        decoded_url = decode_url(s.get('sourceUrl', ''))
        decoded.append({
            'sourceName': s.get('sourceName'),
            'priority':   s.get('priority', 0),
            'type':       s.get('type'),
            'decodedUrl': decoded_url,
        })

    # Drop internal /apivtwo URLs
    filtered = [s for s in decoded if not s['decodedUrl'].startswith('/apivtwo')]
    # Keep only https:// or // URLs
    filtered = [s for s in filtered if s['decodedUrl'].startswith('https://') or s['decodedUrl'].startswith('//')]

    mapped = [
        {
            'name':     s['sourceName'],
            'priority': s['priority'],
            'type':     'direct' if s['type'] == 'player' else 'iframe',
            'url':      s['decodedUrl'],
        }
        for s in filtered
    ]
    mapped.sort(key=lambda x: -x['priority'])
    return mapped


# ── Tests: decodeUrl ──────────────────────────────────────────────────────────

class TestDecodeUrl(unittest.TestCase):

    def test_plain_url_returned_unchanged(self):
        url = 'https://cdn.example.com/video.mp4'
        self.assertEqual(decode_url(url), url)

    def test_protocol_relative_url_returned_unchanged(self):
        url = '//cdn.example.com/embed.html'
        self.assertEqual(decode_url(url), url)

    def test_encoded_url_decoded_correctly(self):
        plain = 'https://stream.allanime.co/ep1.m3u8'
        encoded = xor_encode_url(plain)
        self.assertTrue(encoded.startswith('--'))
        self.assertEqual(decode_url(encoded), plain)

    def test_roundtrip_preserves_arbitrary_https_url(self):
        plain = 'https://cdn.allanime.to/apivtwo/clock/hls/1080p/episode1.m3u8'
        self.assertEqual(decode_url(xor_encode_url(plain)), plain)

    def test_double_dash_prefix_triggers_decoding(self):
        # Only strings starting with '--' are decoded
        not_encoded = '-notencoded'
        self.assertEqual(decode_url(not_encoded), not_encoded)

    def test_empty_string_returned_unchanged(self):
        self.assertEqual(decode_url(''), '')


# ── Tests: AllAnime source processing ────────────────────────────────────────

class TestAllAnimeSourceProcessing(unittest.TestCase):

    def test_apivtwo_urls_filtered_out(self):
        raw = [
            {'sourceUrl': xor_encode_url('/apivtwo/clock?id=x'), 'sourceName': 'Internal', 'type': 'player', 'priority': 10},
            {'sourceUrl': 'https://cdn.example.com/v.mp4',       'sourceName': 'Valid',    'type': 'player', 'priority': 5},
        ]
        result = process_allanime_sources(raw)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'Valid')

    def test_relative_url_without_protocol_filtered_out(self):
        raw = [
            {'sourceUrl': '/path/to/video.mp4',       'sourceName': 'Relative', 'type': 'player', 'priority': 5},
            {'sourceUrl': 'https://ok.example.com/v', 'sourceName': 'Absolute', 'type': 'player', 'priority': 3},
        ]
        result = process_allanime_sources(raw)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'Absolute')

    def test_protocol_relative_url_kept(self):
        raw = [{'sourceUrl': '//cdn.example.com/embed.html', 'sourceName': 'Embed', 'type': 'iframe', 'priority': 4}]
        result = process_allanime_sources(raw)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['url'], '//cdn.example.com/embed.html')

    def test_player_type_mapped_to_direct(self):
        raw = [{'sourceUrl': 'https://cdn.example.com/v.mp4', 'sourceName': 'MP4', 'type': 'player', 'priority': 1}]
        result = process_allanime_sources(raw)
        self.assertEqual(result[0]['type'], 'direct')

    def test_non_player_type_mapped_to_iframe(self):
        raw = [
            {'sourceUrl': 'https://embed1.com/', 'sourceName': 'IFrame', 'type': 'iframe',  'priority': 2},
            {'sourceUrl': 'https://embed2.com/', 'sourceName': 'Embed',  'type': 'embed',   'priority': 1},
            {'sourceUrl': 'https://embed3.com/', 'sourceName': 'Other',  'type': 'unknown', 'priority': 3},
        ]
        result = process_allanime_sources(raw)
        self.assertTrue(all(s['type'] == 'iframe' for s in result))

    def test_sources_sorted_by_priority_descending(self):
        raw = [
            {'sourceUrl': 'https://a.com/1', 'sourceName': 'Low',  'type': 'player', 'priority': 1},
            {'sourceUrl': 'https://a.com/2', 'sourceName': 'High', 'type': 'player', 'priority': 9},
            {'sourceUrl': 'https://a.com/3', 'sourceName': 'Mid',  'type': 'player', 'priority': 5},
        ]
        result = process_allanime_sources(raw)
        priorities = [s['priority'] for s in result]
        self.assertEqual(priorities, sorted(priorities, reverse=True))

    def test_empty_source_list_returns_empty(self):
        self.assertEqual(process_allanime_sources([]), [])

    def test_encoded_url_decoded_before_filtering(self):
        # An encoded URL that decodes to a valid https:// URL must survive filtering
        plain = 'https://cdn.allanime.co/hls/episode1.m3u8'
        raw = [{'sourceUrl': xor_encode_url(plain), 'sourceName': 'Encoded', 'type': 'player', 'priority': 8}]
        result = process_allanime_sources(raw)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['url'], plain)


if __name__ == '__main__':
    unittest.main(verbosity=2)
