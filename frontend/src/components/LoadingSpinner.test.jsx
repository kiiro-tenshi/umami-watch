import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner.jsx';

describe('LoadingSpinner', () => {
  it('renders the loading text', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders a full-screen container when fullScreen prop is true', () => {
    const { container } = render(<LoadingSpinner fullScreen />);
    const wrapper = container.firstChild;
    expect(wrapper.className).toContain('min-h-screen');
  });

  it('renders a padded inline container when fullScreen is false', () => {
    const { container } = render(<LoadingSpinner />);
    const wrapper = container.firstChild;
    expect(wrapper.className).not.toContain('min-h-screen');
    expect(wrapper.className).toContain('p-8');
  });
});
