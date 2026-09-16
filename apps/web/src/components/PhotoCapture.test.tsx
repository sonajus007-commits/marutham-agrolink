import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PhotoCapture } from './PhotoCapture';

/* The single proof-photo control. Canvas downscaling is exercised elsewhere; here we
 * hold the states that don't need a real <canvas>: the add affordance when empty, and
 * the preview + remove when a photo is attached. */

vi.mock('../native/camera', () => ({
  cameraAvailable: () => false, // browser path: an <input type="file">, not the native prompt
  capturePhoto: vi.fn(),
}));

describe('PhotoCapture', () => {
  it('shows the add label when no photo is attached', () => {
    render(<PhotoCapture value={null} onChange={vi.fn()} label="Add photo" />);
    expect(screen.getByText(/Add photo/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows a preview and removes the photo on ✕', async () => {
    const onChange = vi.fn();
    const uri = 'data:image/jpeg;base64,AAAA';
    render(<PhotoCapture value={uri} onChange={onChange} label="Add photo" />);

    expect(screen.getByRole('img')).toHaveAttribute('src', uri);
    await userEvent.click(screen.getByRole('button', { name: /Remove photo/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
