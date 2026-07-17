import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '@marutham/ui';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'Organic', variant: 'neutral' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['cod', 'upi', 'neutral', 'success', 'danger', 'info', 'warning'],
    },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Neutral: Story = {};
export const Cod: Story = { args: { variant: 'cod', children: 'COD' } };
export const Upi: Story = { args: { variant: 'upi', children: 'UPI' } };

/* The tone variants, as an order's status wears them. Each is a tinted `<role>Bg`
 * under its `<role>Fg` ink — never the status's own `statusColor`, which is a bar
 * fill and is pale enough on two statuses that no text passes AA on it. */
export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge variant="success">Delivered</Badge>
      <Badge variant="info">Out for Delivery</Badge>
      <Badge variant="warning">Order Placed</Badge>
      <Badge variant="danger">Cancelled</Badge>
      <Badge variant="neutral">Unknown</Badge>
    </div>
  ),
};
