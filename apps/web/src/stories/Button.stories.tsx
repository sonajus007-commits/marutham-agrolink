import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@marutham/ui';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Confirm order' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'ghost', 'danger'] },
    block: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Back to cart' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Cancel order' } };
export const Disabled: Story = { args: { disabled: true } };
export const FullWidth: Story = { args: { block: true, children: 'Place order' } };
