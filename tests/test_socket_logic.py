"""
Tests for Socket.IO event-handler business logic (mirrors server/socket/roomSocket.js).
Run with: python3 tests/test_socket_logic.py
"""

import unittest


# ── Replicated logic from server/socket/roomSocket.js ────────────────────────

def validate_chat_message(text):
    """
    Port of the chat:message guard:
        if (typeof text !== 'string' || !text.trim() || text.length > 500) return;
    Returns True if the message should be saved, False if it should be dropped.
    """
    if not isinstance(text, str):
        return False
    if not text.strip():
        return False
    if len(text) > 500:
        return False
    return True


def guard_host(socket_room_id, socket_is_host):
    """
    Port of the guardHost() closure:
        const guardHost = () => socket.roomId && socket.isHost;
    Returns True if the socket may emit playback events.
    """
    return bool(socket_room_id) and socket_is_host


def check_room_access(room_data, uid):
    """
    Port of the join-room membership check:
        if (!roomSnap.exists || !roomSnap.data().members.includes(uid))
    Returns True if access is granted, False if denied.
    """
    if not room_data:
        return False
    return uid in room_data.get('members', [])


def resolve_is_host(room_data, uid):
    """
    Port of:  socket.isHost = roomData.hostId === uid;
    """
    return room_data.get('hostId') == uid


# ── Tests: chat message validation ───────────────────────────────────────────

class TestValidateChatMessage(unittest.TestCase):

    def test_valid_message_accepted(self):
        self.assertTrue(validate_chat_message('Hello world!'))

    def test_empty_string_rejected(self):
        self.assertFalse(validate_chat_message(''))

    def test_whitespace_only_rejected(self):
        self.assertFalse(validate_chat_message('   '))

    def test_tab_only_rejected(self):
        self.assertFalse(validate_chat_message('\t\n'))

    def test_exactly_500_chars_accepted(self):
        self.assertTrue(validate_chat_message('x' * 500))

    def test_501_chars_rejected(self):
        self.assertFalse(validate_chat_message('x' * 501))

    def test_non_string_rejected(self):
        self.assertFalse(validate_chat_message(None))
        self.assertFalse(validate_chat_message(123))
        self.assertFalse(validate_chat_message(['list']))

    def test_message_with_leading_trailing_whitespace_accepted(self):
        # The guard only rejects *all-whitespace*, not padded messages
        self.assertTrue(validate_chat_message('  hello  '))


# ── Tests: host guard ─────────────────────────────────────────────────────────

class TestGuardHost(unittest.TestCase):

    def test_host_in_room_allowed(self):
        self.assertTrue(guard_host('room-1', True))

    def test_non_host_blocked(self):
        self.assertFalse(guard_host('room-1', False))

    def test_host_without_room_id_blocked(self):
        self.assertFalse(guard_host(None, True))

    def test_non_host_without_room_blocked(self):
        self.assertFalse(guard_host(None, False))


# ── Tests: join-room access check ────────────────────────────────────────────

class TestCheckRoomAccess(unittest.TestCase):

    def test_member_granted_access(self):
        room = {'members': ['uid-host', 'uid-viewer'], 'hostId': 'uid-host'}
        self.assertTrue(check_room_access(room, 'uid-host'))
        self.assertTrue(check_room_access(room, 'uid-viewer'))

    def test_non_member_denied(self):
        room = {'members': ['uid-host'], 'hostId': 'uid-host'}
        self.assertFalse(check_room_access(room, 'intruder'))

    def test_none_room_data_denied(self):
        self.assertFalse(check_room_access(None, 'uid-1'))

    def test_empty_members_list_denied(self):
        self.assertFalse(check_room_access({'members': []}, 'uid-1'))


# ── Tests: host resolution ────────────────────────────────────────────────────

class TestResolveIsHost(unittest.TestCase):

    def test_host_uid_matches(self):
        self.assertTrue(resolve_is_host({'hostId': 'uid-host'}, 'uid-host'))

    def test_viewer_uid_does_not_match(self):
        self.assertFalse(resolve_is_host({'hostId': 'uid-host'}, 'uid-viewer'))

    def test_missing_host_id_returns_false(self):
        self.assertFalse(resolve_is_host({}, 'uid-1'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
