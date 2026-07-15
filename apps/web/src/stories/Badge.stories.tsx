import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '@marutham/ui';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'Organic', variant: 'neutral' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['cod', 'upi', 'neutral'] },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Neutral: Story = {};
export const Cod: Story = { args: { variant: 'cod', children: 'COD' } };
export const Upi: Story = { args: { variant: 'upi', children: 'UPI' } };
