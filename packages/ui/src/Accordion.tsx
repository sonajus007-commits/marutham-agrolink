import type { ReactNode } from 'react';
import * as RadixAccordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from './lib/cn';

/* Collapsible sections, on Radix.
 *
 * Radix wires the `aria-expanded` / `aria-controls` pair, Up/Down/Home/End on
 * the headers, and — the part worth the dependency — it measures the collapsed
 * panel and publishes the result as `--radix-accordion-content-height` on the
 * content element. `height: auto` is not interpolable, so without that measured
 * pixel value the open/close transition cannot be animated at all. The two
 * keyframes that consume it live in apps/web/src/tailwind.css.
 *
 * A closed panel is unmounted, not hidden — unlike Tabs, whose inactive panels
 * stay mounted with `hidden`. Do not write a test that asserts on the text of a
 * collapsed section. */

export interface AccordionItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

interface Base {
  items: AccordionItem[];
  className?: string;
}

/* The two modes carry different value shapes, and Radix's own Root props are a
 * discriminated union for the same reason. Flattening this to
 * `value?: string | string[]` would let `type="multiple" value="a"` typecheck. */
export type AccordionProps = Base &
  (
    | {
        /** One panel at a time; opening one closes the last. Clicking the open
         *  header closes it, leaving all panels shut. */
        type?: 'single';
        value?: string;
        defaultValue?: string;
        onValueChange?: (value: string) => void;
      }
    | {
        type: 'multiple';
        value?: string[];
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
      }
  );

/* Preflight is off, so the header's <button> resets itself. */
const TRIGGER =
  'group flex w-full cursor-pointer appearance-none items-center justify-between gap-3 ' +
  'border-0 bg-transparent px-1 py-3.5 text-left font-sans text-sm font-bold text-fg ' +
  'hover:text-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-55 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf';

/* `overflow-hidden` is load-bearing: the panel animates its height from 0, and
 * without it the content spills out over the section below for 180ms. */
const CONTENT =
  'overflow-hidden ' +
  'data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up ' +
  'motion-reduce:animate-none';

export function Accordion(props: AccordionProps) {
  const { items, className } = props;

  const sections = items.map((item) => (
    <RadixAccordion.Item
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      className="border-b border-border-subtle"
    >
      <RadixAccordion.Header className="m-0">
        <RadixAccordion.Trigger className={TRIGGER}>
          {item.label}
          {/* The chevron is decorative — the trigger already announces its state. */}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn(
              'shrink-0 text-fg-muted transition-transform ease-standard',
              'duration-[var(--duration-fast)] group-data-[state=open]:rotate-180',
            )}
          />
        </RadixAccordion.Trigger>
      </RadixAccordion.Header>

      <RadixAccordion.Content className={CONTENT}>
        <div className="px-1 pb-3.5 text-sm leading-normal text-fg-muted">{item.content}</div>
      </RadixAccordion.Content>
    </RadixAccordion.Item>
  ));

  if (props.type === 'multiple') {
    return (
      <RadixAccordion.Root
        type="multiple"
        value={props.value}
        defaultValue={props.defaultValue}
        onValueChange={props.onValueChange}
        className={className}
      >
        {sections}
      </RadixAccordion.Root>
    );
  }

  return (
    <RadixAccordion.Root
      type="single"
      collapsible
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={props.onValueChange}
      className={className}
    >
      {sections}
    </RadixAccordion.Root>
  );
}
