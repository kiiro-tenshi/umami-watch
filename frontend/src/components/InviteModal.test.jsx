import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InviteModal from './InviteModal';

describe('InviteModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  // ── Display ───────────────────────────────────────────────────────────────
  it('displays the invite code prominently', () => {
    render(<InviteModal inviteCode="ABC123" onClose={onClose} />);
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  it('renders a "Room Code" label', () => {
    render(<InviteModal inviteCode="XYZ789" onClose={onClose} />);
    expect(screen.getByText('Room Code')).toBeInTheDocument();
  });

  it('renders "Invite Friends" heading', () => {
    render(<InviteModal inviteCode="ABC123" onClose={onClose} />);
    expect(screen.getByText('Invite Friends')).toBeInTheDocument();
  });

  // ── Close ─────────────────────────────────────────────────────────────────
  it('calls onClose when the × button is clicked', () => {
    render(<InviteModal inviteCode="ABC123" onClose={onClose} />);
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Copy Code ─────────────────────────────────────────────────────────────
  it('copies the invite code to clipboard when Copy Code is clicked', async () => {
    render(<InviteModal inviteCode="XYZ789" onClose={onClose} />);
    await userEvent.click(screen.getByText('Copy Code'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('XYZ789');
  });

  it('shows ✓ Copied! inline feedback after copying code', async () => {
    render(<InviteModal inviteCode="XYZ789" onClose={onClose} />);
    await userEvent.click(screen.getByText('Copy Code'));
    await waitFor(() => expect(screen.getByText('✓ Copied!')).toBeInTheDocument());
  });

  it('does NOT use alert() when copying code (uses inline feedback instead)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<InviteModal inviteCode="XYZ789" onClose={onClose} />);
    await userEvent.click(screen.getByText('Copy Code'));
    await waitFor(() => screen.getByText('✓ Copied!'));
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  // ── Copy Link ─────────────────────────────────────────────────────────────
  it('copies the join URL to clipboard when Copy Link is clicked', async () => {
    render(<InviteModal inviteCode="XYZ789" onClose={onClose} />);
    await userEvent.click(screen.getByText('Copy Link'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/join/XYZ789')
    );
  });

  it('includes window.location.origin in the copied join URL', async () => {
    render(<InviteModal inviteCode="XYZ789" onClose={onClose} />);
    await userEvent.click(screen.getByText('Copy Link'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringMatching(/^http/)
    );
  });

  // ── Native Share ──────────────────────────────────────────────────────────
  it('shows a Share Invite button when navigator.share is available', () => {
    Object.assign(navigator, { share: vi.fn().mockResolvedValue(undefined) });
    render(<InviteModal inviteCode="ABC123" onClose={onClose} />);
    expect(screen.getByText('Share Invite')).toBeInTheDocument();
    delete navigator.share;
  });

  it('does not show Share Invite button when navigator.share is unavailable', () => {
    const original = navigator.share;
    delete navigator.share;
    render(<InviteModal inviteCode="ABC123" onClose={onClose} />);
    expect(screen.queryByText('Share Invite')).not.toBeInTheDocument();
    if (original) navigator.share = original;
  });

  it('calls navigator.share with correct title, text, and url', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: shareMock });

    render(<InviteModal inviteCode="ABC123" onClose={onClose} />);
    await userEvent.click(screen.getByText('Share Invite'));

    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('UmamiStream'),
        text: expect.stringContaining('ABC123'),
        url: expect.stringContaining('/join/ABC123'),
      })
    );
    delete navigator.share;
  });
});
