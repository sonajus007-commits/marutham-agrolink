import type { Meta, StoryObj } from '@storybook/react';
import { StatTile } from '@marutham/ui';

const meta: Meta<typeof StatTile> = {
  title: 'Components/StatTile',
  component: StatTile,
  tags: ['autodocs'],
  args: { label: "Today's orders", value: 128, hint: '+12% vs yesterday' },
};
export default meta;

type Story = StoryObj<typeof StatTile>;

export const Default: Story = {};
export const WithIcon: Story = {
  args: { icon: '🧺', label: 'Baskets packed', value: 42, hint: null },
};
export const Accented: Story = {
  args: { label: 'Refunds', value: '₹1,240', accent: 'var(--danger)' },
};
