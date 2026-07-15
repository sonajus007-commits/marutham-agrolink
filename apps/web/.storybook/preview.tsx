import type { Preview } from '@storybook/react';
// Load the exact token + Tailwind pipeline the app uses, so components render with
// real colours, spacing and type. tokens.css rides in via tailwind.css; styles.css
// carries the app's own base reset. Without these the catalog is unstyled markup.
import '../src/tailwind.css';
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // The a11y addon runs axe on the rendered story; findings show in its panel.
    layout: 'centered',
  },
  // Sit every story on the themed app background at a comfortable inset.
  decorators: [
    (Story) => (
      <div className="bg-bg text-fg" style={{ padding: '2rem' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
