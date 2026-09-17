import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProofGallery } from './ProofGallery';

/* The consumer proof viewer closes Phase 2: it fetches GET /orders/:id/proofs and
 * shows the field photos. The tests hold the contract — no card at all when there are
 * no photos, a thumbnail per proof otherwise, and a tap opens the enlarged view with a
 * location link only when the proof carries coordinates. */

const getOrderProofs = vi.fn();

vi.mock('@marutham/api-client', () => ({
  api: { getOrderProofs: (...args: unknown[]) => getOrderProofs(...args) },
}));

const IMG = 'data:image/jpeg;base64,AAAA';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProofGallery', () => {
  it('renders nothing when the order has no proofs', async () => {
    getOrderProofs.mockResolvedValue({ proofs: [] });
    const { container } = render(<ProofGallery orderId="o1" />);
    await waitFor(() => expect(getOrderProofs).toHaveBeenCalledWith('o1'));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the fetch fails (best-effort)', async () => {
    getOrderProofs.mockRejectedValue(new Error('nope'));
    const { container } = render(<ProofGallery orderId="o1" />);
    await waitFor(() => expect(getOrderProofs).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a thumbnail per proof and opens the enlarged view with a location link', async () => {
    getOrderProofs.mockResolvedValue({
      proofs: [
        {
          id: 'p1',
          kind: 'delivery',
          image: IMG,
          lat: 11.1,
          lng: 77.2,
          created_at: '2026-09-16T10:00:00Z',
        },
        {
          id: 'p2',
          kind: 'verify',
          image: IMG,
          lat: null,
          lng: null,
          created_at: '2026-09-16T08:00:00Z',
        },
      ],
    });
    const user = userEvent.setup();
    render(<ProofGallery orderId="o1" />);

    // Two thumbnails, one per proof.
    const thumbs = await screen.findAllByRole('button', {
      name: /Collected from farm|Delivered to you/,
    });
    expect(thumbs).toHaveLength(2);

    // Tapping the delivery proof (has coords) opens the enlarged view with a maps link.
    await user.click(
      thumbs.find((b) => /Delivered to you/.test(b.getAttribute('aria-label') || ''))!,
    );
    const loc = await screen.findByRole('link', { name: /View location/ });
    expect(loc).toHaveAttribute('href', expect.stringContaining('11.1,77.2'));
  });

  it('omits the location link for a proof without coordinates', async () => {
    getOrderProofs.mockResolvedValue({
      proofs: [
        {
          id: 'p2',
          kind: 'verify',
          image: IMG,
          lat: null,
          lng: null,
          created_at: '2026-09-16T08:00:00Z',
        },
      ],
    });
    const user = userEvent.setup();
    render(<ProofGallery orderId="o1" />);

    const thumb = await screen.findByRole('button', { name: /Collected from farm/ });
    await user.click(thumb);
    // The enlarged view opened, but there is no map link.
    await screen.findByRole('dialog');
    expect(screen.queryByRole('link', { name: /View location/ })).toBeNull();
  });
});
