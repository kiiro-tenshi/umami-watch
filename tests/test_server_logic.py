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


if __name__ == '__main__':
    unittest.main(verbosity=2)
