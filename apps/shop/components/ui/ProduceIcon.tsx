import {
  Apple,
  Beef,
  Carrot,
  Drumstick,
  Egg,
  Fish,
  Milk,
  Package,
  ShoppingBasket,
  Sprout,
  Wheat,
  type LucideIcon,
} from 'lucide-react';

/* One line-icon set for produce, in place of emoji. Emoji render differently on
 * every phone (and as tofu on some), clash with the real photographs beside
 * them, and can't take a brand colour. These are lucide strokes, so they inherit
 * currentColor and sit in the same visual family as the rest of the site.
 *
 * The product NAME is tried first, against a short list of unambiguous words,
 * because some categories are mixed: "Yogurt & Eggs" would otherwise draw an egg
 * on Curd. Then the CATEGORY (a closed, data-driven set), matched by keyword
 * anywhere in the lower-cased name, first hit wins; anything unknown falls back
 * to a basket rather than breaking. */
const BY_NAME: [string, LucideIcon][] = [
  ['curd', Milk],
  ['yogurt', Milk],
  ['paneer', Milk],
  ['ghee', Milk],
  ['butter', Milk],
  ['milk', Milk],
  ['egg', Egg],
  ['fish', Fish],
  ['prawn', Fish],
  ['crab', Fish],
  ['chicken', Drumstick],
  ['mutton', Beef],
  ['rice', Wheat],
  ['wheat', Wheat],
  ['millet', Wheat],
];

const ICONS: [string, LucideIcon][] = [
  ['veget', Carrot],
  ['fruit', Apple],
  ['poultry', Drumstick],
  ['seafood', Fish],
  ['fish', Fish],
  ['egg', Egg],
  ['yogurt', Egg],
  ['milk', Milk],
  ['cream', Milk],
  ['dairy', Milk],
  ['meat', Beef],
  ['grain', Wheat],
  ['rice', Wheat],
  ['cereal', Wheat],
  ['can', Package],
  ['packag', Package],
  ['organic', Sprout],
];

export function produceIcon(name?: string | null, category?: string | null): LucideIcon {
  const n = (name ?? '').toLowerCase();
  for (const [k, Icon] of BY_NAME) if (n.includes(k)) return Icon;
  const c = (category ?? '').toLowerCase();
  for (const [k, Icon] of ICONS) if (c.includes(k)) return Icon;
  return ShoppingBasket;
}

export function ProduceIcon({
  name,
  category,
  className = '',
}: {
  /** The product name; omit for a category chip. */
  name?: string | null;
  category?: string | null;
  className?: string;
}) {
  const Icon = produceIcon(name, category);
  return <Icon className={className} strokeWidth={1.5} aria-hidden="true" />;
}
