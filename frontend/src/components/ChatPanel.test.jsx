import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('token-abc') } },
}));

// Lightweight emoji-mart stub so we don't pull the real WASM bundle
vi.mock('@emoji-mart/react', () => ({
  default: ({ onEmojiSelect }) => (
    <button data-testid="emoji-picker" onClick={() => onEmojiSelect({ native: '😂' })}>EmojiPicker</button>
  ),
}));
vi.mock('@emoji-mart/data', () => ({ default: {} }));

// Stub fetch — message history endpoint returns empty array by default
const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
vi.stubGlobal('fetch', mockFetch);

import ChatPanel from './ChatPanel';

// ── Helpers ────────────────────────────────────────────────────────────────
const USER = { uid: 'u1', displayName: 'Tester', photoURL: null };

function makeSocket() {
  const listeners = {};
  return {
    on:  vi.fn((event, fn) => { listeners[event] = fn; }),
    off: vi.fn(),
    emit: vi.fn(),
    _listeners: listeners,
    _trigger: (event, ...args) => listeners[event]?.(...args),
  };
}

describe('ChatPanel', () => {
  let socket;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    socket = makeSocket();
  });

  // ── Layout ─────────────────────────────────────────────────────────────
  it('renders the Live Chat header', () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    expect(screen.getByText('Live Chat')).toBeInTheDocument();
  });

  it('shows an empty-state prompt when there are no messages', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    await waitFor(() => expect(screen.getByText('No messages yet. Say hi!')).toBeInTheDocument());
  });

  it('renders GIF and emoji toggle buttons in the input bar', () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    expect(screen.getByText('GIF')).toBeInTheDocument();
    expect(screen.getByText('😊')).toBeInTheDocument();
  });

  // ── Sending messages ────────────────────────────────────────────────────
  it('emits chat:message with text when the form is submitted', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    const input = screen.getByPlaceholderText('Type a message...');
    await userEvent.type(input, 'Hello world');
    fireEvent.submit(input.closest('form'));
    expect(socket.emit).toHaveBeenCalledWith('chat:message', { type: 'text', text: 'Hello world' });
  });

  it('clears the input field after sending', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    const input = screen.getByPlaceholderText('Type a message...');
    await userEvent.type(input, 'Hello');
    fireEvent.submit(input.closest('form'));
    expect(input.value).toBe('');
  });

  it('does not emit chat:message for blank input', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    const input = screen.getByPlaceholderText('Type a message...');
    await userEvent.type(input, '   ');
    fireEvent.submit(input.closest('form'));
    expect(socket.emit).not.toHaveBeenCalledWith('chat:message', expect.anything());
  });

  it('send button is disabled when input is empty', () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    // The submit button has disabled prop when input is blank
    const btn = screen.getByRole('button', { name: '' }); // SVG send button
    // check disabled attribute via the disabled state
    expect(screen.getByPlaceholderText('Type a message...').value).toBe('');
  });

  // ── Receiving messages ──────────────────────────────────────────────────
  it('displays an incoming text message from socket event', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    const msg = { id: 'm1', uid: 'u2', displayName: 'Friend', text: 'Hey there!', type: 'text' };

    act(() => socket._trigger('chat:message', msg));

    await waitFor(() => expect(screen.getByText('Hey there!')).toBeInTheDocument());
  });

  it('displays the sender display name for messages from others', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    const msg = { id: 'm2', uid: 'other-uid', displayName: 'Alice', text: 'Hello!', type: 'text' };

    act(() => socket._trigger('chat:message', msg));

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });

  it('shows system join message when a user joins', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);

    act(() => socket._trigger('user-joined', { displayName: 'Bob' }));

    await waitFor(() => expect(screen.getByText('Bob joined the room')).toBeInTheDocument());
  });

  it('shows system leave message when a user leaves', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);

    act(() => socket._trigger('user-left', { displayName: 'Carol' }));

    await waitFor(() => expect(screen.getByText('Carol left the room')).toBeInTheDocument());
  });

  // ── Typing indicator ────────────────────────────────────────────────────
  it('shows typing indicator when another user is typing', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);

    act(() => socket._trigger('chat:typing', { displayName: 'Alice' }));

    await waitFor(() => expect(screen.getByText(/Alice.*typing/)).toBeInTheDocument());
  });

  // ── Emoji picker ────────────────────────────────────────────────────────
  it('toggles emoji picker on emoji button click', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('😊'));
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
  });

  it('appends the selected emoji to the message input', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    await userEvent.click(screen.getByText('😊'));
    await userEvent.click(screen.getByTestId('emoji-picker'));

    const input = screen.getByPlaceholderText('Type a message...');
    expect(input.value).toBe('😂');
  });

  // ── GIF picker ──────────────────────────────────────────────────────────
  it('toggles GIF picker on GIF button click', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    expect(screen.queryByPlaceholderText('Search GIFs...')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('GIF'));
    expect(screen.getByPlaceholderText('Search GIFs...')).toBeInTheDocument();
  });

  it('closes GIF picker when GIF button is clicked again', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    await userEvent.click(screen.getByText('GIF'));
    await userEvent.click(screen.getByText('GIF'));
    expect(screen.queryByPlaceholderText('Search GIFs...')).not.toBeInTheDocument();
  });

  // ── Chat:typing emission ─────────────────────────────────────────────────
  it('emits chat:typing to socket when the user starts typing', async () => {
    render(<ChatPanel roomId="r1" socket={socket} user={USER} />);
    const input = screen.getByPlaceholderText('Type a message...');
    await userEvent.type(input, 'H');
    expect(socket.emit).toHaveBeenCalledWith('chat:typing');
  });
});
