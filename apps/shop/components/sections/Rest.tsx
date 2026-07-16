import {
  Boxes,
  MapPin,
  Star,
  RotateCcw,
  WifiOff,
  Smartphone,
  Recycle,
  Users,
  Scale,
  Phone,
  Mail,
} from 'lucide-react';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { ImageSlot } from '@/components/ui/Placeholder';
import { Button } from '@/components/ui/Button';
import { PORTAL_REGISTER } from '@/lib/portal';

/* Business features, mobile, sustainability, marketplace features, FAQ, contact.
 *
 * Everything claimed here is shipped behaviour. Where a thing is only partly
 * true it says so in the copy rather than rounding up — the mobile section says
 * the native app is in testing, because it is, and the sustainability section
 * makes no measured claims because nothing measures them. */

export function BusinessFeatures() {
  const items = [
    {
      icon: Boxes,
      t: 'Bulk listings',
      d: 'List larger quantities with your own bulk pricing and discount bands.',
    },
    {
      icon: Scale,
      t: 'Your own fee terms',
      d: 'Retailers and farmers carry different platform fees. The rate you see is the rate you get.',
    },
    {
      icon: Users,
      t: 'A verified identity',
      d: 'Business accounts are approved by the team, with GST and bank details on file.',
    },
  ];
  return (
    <Section id="business" tone="sand" aria-labelledby="biz-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div>
          <SectionHeader
            id="biz-h"
            eyebrow="For businesses"
            accent="earth"
            title="Sell at scale on the same rails"
            lede="Retailers, traders and bulk buyers work the platform the growers do — with terms that fit the volume."
          />
          <ul className="mt-10 flex list-none flex-col gap-6 p-0">
            {items.map((it, i) => (
              <Reveal as="li" key={it.t} kind="fade-up" delay={i * 0.07}>
                <div className="flex gap-4">
                  <span className="text-earth-500 mt-0.5">
                    <it.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-forest-900 font-semibold">{it.t}</h3>
                    <p className="text-fg-muted mt-1 max-w-[46ch] text-caption leading-relaxed">
                      {it.d}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
          <div className="mt-9">
            <Button href={PORTAL_REGISTER} variant="earth" arrow>
              Register a business
            </Button>
          </div>
        </div>
        <Reveal kind="scale">
          <ImageSlot
            aspect="aspect-[4/3]"
            description="Crates being weighed and logged at a collection hub — process, not portraiture."
          />
        </Reveal>
      </div>
    </Section>
  );
}

export function MobileApp() {
  return (
    <Section id="mobile" tone="forest" aria-labelledby="mob-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <Reveal kind="scale" className="lg:order-2">
          <ImageSlot
            tone="dark"
            aspect="aspect-[4/3]"
            description="The app on a phone held in the field — collection officer scanning a pickup."
          />
        </Reveal>
        <div className="lg:order-1">
          <SectionHeader
            id="mob-h"
            eyebrow="On your phone"
            tone="dark"
            title="Built for a field with no signal"
            lede="Collection officers and delivery partners work where the network does not. So the app keeps working, and catches up when it can."
          />
          <ul className="mt-8 flex list-none flex-col gap-4 p-0">
            {[
              {
                icon: WifiOff,
                t: 'Works offline',
                d: 'Scans and updates made without signal are queued and replayed on reconnect.',
              },
              {
                icon: Smartphone,
                t: 'Installs from the browser',
                d: 'Add it to your home screen today — no store needed.',
              },
              {
                icon: MapPin,
                t: 'Location where it matters',
                d: 'Proof of delivery and farm pins are captured on the spot.',
              },
            ].map((f, i) => (
              <Reveal as="li" key={f.t} kind="fade-up" delay={i * 0.07}>
                <div className="flex gap-3">
                  <f.icon className="text-leaf-300 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p className="text-caption">
                    <span className="text-surface font-semibold">{f.t}.</span>{' '}
                    <span className="text-leaf-300">{f.d}</span>
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

export function Sustainability() {
  return (
    <Section id="sustainability" tone="mist" aria-labelledby="sus-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <Reveal kind="scale">
          <ImageSlot
            aspect="aspect-[4/3]"
            description="A field at first light — landscape, no people. Used for calm, not for claims."
          />
        </Reveal>
        <div>
          <SectionHeader
            id="sus-h"
            eyebrow="Sustainability"
            accent="forest"
            title="A shorter road from soil to kitchen"
            lede="Fewer stops means less handling and less waste. We would rather show you the route than quote a number we have not measured."
          />
          <ul className="mt-8 flex list-none flex-col gap-4 p-0">
            {[
              {
                icon: Recycle,
                t: 'Harvest to order',
                d: 'Growers confirm what is available that morning, so less is picked than never sells.',
              },
              {
                icon: MapPin,
                t: 'Sold where it grows',
                d: 'You see your own district first. Most produce travels a short way.',
              },
              {
                icon: Users,
                t: 'The grower is named',
                d: 'Every order traces to the person who grew it — the shortest kind of accountability.',
              },
            ].map((f, i) => (
              <Reveal as="li" key={f.t} kind="fade-up" delay={i * 0.07}>
                <div className="flex gap-3">
                  <f.icon className="text-forest-700 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p className="text-caption">
                    <span className="text-forest-900 font-semibold">{f.t}.</span>{' '}
                    <span className="text-fg-muted">{f.d}</span>
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

export function MarketplaceFeatures() {
  const items = [
    {
      icon: MapPin,
      t: 'District pricing',
      d: 'Every product carries its own price per district, kept beside the government mandi rate.',
    },
    {
      icon: Star,
      t: 'Ratings that reach a person',
      d: 'You rate the grower, not a warehouse. It shows on their dashboard.',
    },
    {
      icon: RotateCcw,
      t: 'Returns with a photo',
      d: 'Raise a return with an image; it is reviewed and refunded against the order.',
    },
    {
      icon: Boxes,
      t: 'Bulk discounts',
      d: 'Growers can set a quantity band and a discount for buying more of it.',
    },
  ];
  return (
    <Section id="marketplace" tone="surface" aria-labelledby="mkt-h">
      <SectionHeader
        id="mkt-h"
        eyebrow="Marketplace"
        accent="gold"
        title="The parts that make it a market, not a catalogue"
      />
      <ul className="mt-12 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <Reveal as="li" key={it.t} kind="fade-up" delay={i * 0.06}>
            <div className="border-border bg-surface-raised flex h-full flex-col gap-3 rounded-2xl border p-7">
              <it.icon className="text-forest-700 h-5 w-5" aria-hidden="true" />
              <h3 className="text-forest-900 font-semibold">{it.t}</h3>
              <p className="text-fg-muted text-caption leading-relaxed">{it.d}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}

/* FAQ — a real <details> list. No JS, keyboard-operable for free, and the
 * answers are indexable because they are in the HTML rather than behind a
 * click. Every answer below is true of the product today. */
export function FAQ() {
  const qa = [
    {
      q: 'Who decides the price?',
      a: 'The farmer does. They list the rate they want. The platform fee is added on top of it for the buyer — it is not deducted from the grower’s share.',
    },
    {
      q: 'How fresh is “fresh”?',
      a: 'Each listing carries a cutoff time set by the grower that morning. Once the cutoff passes, the listing comes off the shop automatically.',
    },
    {
      q: 'Do I need an account to look?',
      a: 'No. The whole catalogue and every product page is public. You only sign in to place an order.',
    },
    {
      q: 'How do I pay?',
      a: 'UPI or cash on delivery, whichever you prefer, chosen at checkout.',
    },
    {
      q: 'Can I see where my order is?',
      a: 'Yes. Each stage — collection, hub, dispatch, delivery — is scanned by the person doing it, so the status is the real state of your order.',
    },
    {
      q: 'What if something is wrong with it?',
      a: 'Raise a return from the order with a photo. It is reviewed and refunded against that order.',
    },
    {
      q: 'Which areas do you cover?',
      a: 'We are live in Tamil Nadu and growing district by district. The shop shows you what is available where you are.',
    },
  ];
  return (
    <Section id="faq" tone="surface" aria-labelledby="faq-h">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <SectionHeader
          id="faq-h"
          eyebrow="FAQ"
          accent="leaf"
          title="Questions people actually ask"
        />
        <ul className="flex list-none flex-col p-0">
          {qa.map((item, i) => (
            <Reveal as="li" key={item.q} kind="fade" delay={i * 0.04}>
              <details className="border-border group border-b">
                <summary className="text-forest-900 marker:content-none flex cursor-pointer items-center justify-between gap-4 py-5 text-body font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    className="text-forest-500 shrink-0 text-xl transition-transform duration-200 group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="text-fg-muted max-w-[62ch] pb-6 text-caption leading-relaxed">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* Contact. The phone number and address are real business details we do not
 * hold in this repo, so they are marked rather than invented — SUPPORT_PHONE
 * lives in the backend env and is not exposed publicly. */
export function Contact() {
  return (
    <Section id="contact" tone="surface" aria-labelledby="contact-h">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <SectionHeader
          id="contact-h"
          eyebrow="Contact"
          accent="forest"
          title="Talk to a person"
          lede="Questions about selling, an order, or a partnership — there is someone at the other end."
        />
        <Reveal kind="fade-up">
          <ul className="flex list-none flex-col gap-4 p-0">
            <li className="border-border bg-surface-raised flex items-center gap-4 rounded-2xl border p-6">
              <Phone className="text-forest-700 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-forest-900 font-semibold">Support line</p>
                {/* TODO(content): the real number lives in backend .env as
                    SUPPORT_PHONE and is not public. Put it here once confirmed. */}
                <p className="text-fg-muted text-caption">To be published</p>
              </div>
            </li>
            <li className="border-border bg-surface-raised flex items-center gap-4 rounded-2xl border p-6">
              <Mail className="text-forest-700 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-forest-900 font-semibold">Email</p>
                <p className="text-fg-muted text-caption">To be published</p>
              </div>
            </li>
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}
