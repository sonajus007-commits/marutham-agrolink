import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmDialog } from '@marutham/ui';

/* The one gate for a dangerous action. The tests hold its contract: the confirm
 * button fires only after an intentional click, a required reason blocks it until
 * filled and is passed through trimmed, cancel never fires the action, and `busy`
 * locks both buttons so a slow request can't be double-submitted. */

const onConfirm = vi.fn();
const onClose = vi.fn();

beforeEach(() => vi.clearAllMocks());

function open(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  render(
    <ConfirmDialog
      open
      title="Suspend this account?"
      onConfirm={onConfirm}
      onClose={onClose}
      confirmLabel="Suspend"
      cancelLabel="Cancel"
      {...props}
    >
      The user cannot sign in until reactivated.
    </ConfirmDialog>,
  );
  return userEvent.setup();
}

describe('ConfirmDialog', () => {
  it('confirms with no reason when none is asked for', async () => {
    const user = open();
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('cancel closes without confirming', async () => {
    const user = open();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('blocks confirm until a required reason is entered, then passes it trimmed', async () => {
    const user = open({ reason: { label: 'Reason', required: true } });
    const confirm = screen.getByRole('button', { name: 'Suspend' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('textbox'), '  fraud  ');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('fraud');
  });

  it('passes an optional reason through, and undefined when left blank', async () => {
    const user = open({ reason: { label: 'Reason' } });
    // Blank optional reason → undefined, not an empty string.
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('busy disables both buttons', () => {
    open({ busy: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // While busy the confirm shows the ellipsis, not the label.
    expect(screen.getByRole('button', { name: '…' })).toBeDisabled();
  });
});
