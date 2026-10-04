import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ getPack: vi.fn(), getPool: vi.fn(), save: vi.fn(), context: null }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => mocks.context }));
vi.mock('../api/telegramStickers', () => ({ getTelegramStickerPack: mocks.getPack }));
vi.mock('../api/stickerPool', () => ({ getSharedStickerPacks: mocks.getPool }));
import StickerLibrarySettings from './StickerLibrarySettings';

const CAT = { name: 'CatPack', title: 'Cats', enabled: true, shared: false };
function Harness({ packs = [] }) {
  const [user, setUser] = useState({ uid: 'u1', telegramStickerPacks: packs });
  mocks.context = { user, updateUserProfile: async updates => {
    await mocks.save(updates);
    setUser(prev => ({ ...prev, ...updates }));
  } };
  return <StickerLibrarySettings />;
}
const click = async element => act(async () => { await userEvent.click(element); });
async function submitUrl(url) {
  await act(async () => { await userEvent.type(screen.getByLabelText('Telegram sticker pack URL'), url); });
  await click(screen.getByRole('button', { name: 'Add pack' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
  mocks.getPool.mockResolvedValue([]);
  mocks.getPack.mockResolvedValue({ name: 'CatPack', title: 'Cats', stickers: [{ id: 'sticker1' }] });
});

describe('profile sticker library', () => {
  it('adds a verified pack privately, toggles chat and sharing independently, then removes it', async () => {
    render(<Harness />);
    await submitUrl('https://t.me/addstickers/CatPack');
    expect(await screen.findByRole('checkbox', { name: 'Show Cats in chat' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Share Cats with everyone' })).not.toBeChecked();
    expect(mocks.save).toHaveBeenLastCalledWith({ telegramStickerPacks: [CAT] });
    await click(screen.getByRole('checkbox', { name: 'Share Cats with everyone' }));
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith({ telegramStickerPacks: [{ ...CAT, shared: true }] }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Show Cats in chat' })).toBeEnabled());
    await click(screen.getByRole('checkbox', { name: 'Show Cats in chat' }));
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith({ telegramStickerPacks: [{ ...CAT, enabled: false, shared: true }] }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Cats' })).toBeEnabled());
    await click(screen.getByRole('button', { name: 'Remove Cats' }));
    expect(await screen.findByText(/Your library is empty/)).toBeInTheDocument();
    expect(mocks.save).toHaveBeenLastCalledWith({ telegramStickerPacks: [] });
  });

  it('adds a shared pack to the personal library without opting into resharing', async () => {
    mocks.getPool.mockResolvedValue([{ name: 'CatPack', title: 'Cats' }]);
    render(<Harness />);
    await click(await screen.findByRole('button', { name: 'Add Cats to library' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ telegramStickerPacks: [CAT] }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Cats to library' })).toBeDisabled());
    expect(screen.getByRole('checkbox', { name: 'Share Cats with everyone' })).not.toBeChecked();
  });

  it('rejects duplicate pack links without making another Worker request', async () => {
    render(<Harness packs={[CAT]} />);
    await submitUrl('https://t.me/addstickers/catpack');
    expect(await screen.findByRole('alert')).toHaveTextContent(/already in your library/);
    expect(mocks.getPack).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps the library unchanged when saving fails', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Could not save profile'));
    render(<Harness packs={[CAT]} />);
    await click(screen.getByRole('button', { name: 'Remove Cats' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save profile');
    expect(screen.getByRole('checkbox', { name: 'Show Cats in chat' })).toBeChecked();
  });

  it('does not save a nonexistent or unsupported pack', async () => {
    mocks.getPack.mockResolvedValueOnce({ stickers: [] });
    render(<Harness />);
    await submitUrl('https://t.me/addstickers/CatPack');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no supported stickers/);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
