import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { PasswordInput } from './PasswordInput';

/** Minimal controlled host so the reveal toggle drives a real value round-trip. */
function Harness() {
  const [value, setValue] = useState('');
  return <PasswordInput id="pw" value={value} onChange={setValue} placeholder="Password" />;
}

describe('PasswordInput', () => {
  it('masks the input by default', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');
  });

  it('reveals and re-hides the password via the toggle', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByPlaceholderText('Password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(field).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');

    await user.click(hide);
    expect(field).toHaveAttribute('type', 'password');
  });

  it('reports typed characters to onChange', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByPlaceholderText('Password');

    await user.type(field, 'hunter2');
    expect(field).toHaveValue('hunter2');
  });
});
