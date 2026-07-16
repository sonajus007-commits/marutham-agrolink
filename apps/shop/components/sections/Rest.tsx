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
import type { LandingCopy } from '@/lib/landing';
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
 * makes no measured claims because nothing measures them.
 *
 * Icons pair with copy positionally: the arrays here and the item arrays in
 * lib/landing.ts are the same length and the same order. */

export function BusinessFeatures({ c }: { c: LandingCopy }) {
  const icons = [Boxes, Scale, Users];
  return (
    <Section id="business" tone="sand" aria-labelledby="biz-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div className="min-w-0">
          <SectionHeader
            id="biz-h"
            eyebrow={c.business.eyebrow}
            accent="earth"
            title={c.business.title}
            lede={c.business.lede}
          />
          <ul className="mt-10 flex list-none flex-col gap-6 p-0">
            {c.business.items.map((it, i) => {
              const Icon = icons[i];
              return (
                <Reveal as="li" key={it.t} kind="fade-up" delay={i * 0.07}>
                  <div className="flex gap-4">
                    <span className="text-earth-500 mt-0.5">
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-forest-900 font-semibold">{it.t}</h3>
                      <p className="text-fg-muted mt-1 max-w-[46ch] text-caption leading-relaxed">
                        {it.d}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </ul>
          <div className="mt-9">
            <Button href={PORTAL_REGISTER} variant="earth" arrow>
              {c.business.cta}
            </Button>
          </div>
        </div>
        <Reveal kind="scale">
          <ImageSlot
            aspect="aspect-[4/3]"
            slotLabel={c.imageSlot.label}
            description="Crates being weighed and logged at a collection hub — process, not portraiture."
          />
        </Reveal>
      </div>
    </Section>
  );
}

export function MobileApp({ c }: { c: LandingCopy }) {
  const icons = [WifiOff, Smartphone, MapPin];
  return (
    <Section id="mobile" tone="forest" aria-labelledby="mob-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <Reveal kind="scale" className="lg:order-2">
          <ImageSlot
            tone="dark"
            aspect="aspect-[4/3]"
            slotLabel={c.imageSlot.label}
            description="The app on a phone held in the field — collection officer scanning a pickup."
          />
        </Reveal>
        <div className="min-w-0 lg:order-1">
          <SectionHeader
            id="mob-h"
            eyebrow={c.mobile.eyebrow}
            tone="dark"
            title={c.mobile.title}
            lede={c.mobile.lede}
          />
          <ul className="mt-8 flex list-none flex-col gap-4 p-0">
            {c.mobile.items.map((f, i) => {
              const Icon = icons[i];
              return (
                <Reveal as="li" key={f.t} kind="fade-up" delay={i * 0.07}>
                  <div className="flex gap-3">
                    <Icon className="text-leaf-300 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-caption">
                      <span className="text-surface font-semibold">{f.t}.</span>{' '}
                      <span className="text-leaf-300">{f.d}</span>
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </div>
    </Section>
  );
}

export function Sustainability({ c }: { c: LandingCopy }) {
  const icons = [Recycle, MapPin, Users];
  return (
    <Section id="sustainability" tone="mist" aria-labelledby="sus-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <Reveal kind="scale">
          <ImageSlot
            aspect="aspect-[4/3]"
            slotLabel={c.imageSlot.label}
            description="A field at first light — landscape, no people. Used for calm, not for claims."
          />
        </Reveal>
        <div className="min-w-0">
          <SectionHeader
            id="sus-h"
            eyebrow={c.sustainability.eyebrow}
            accent="forest"
            title={c.sustainability.title}
            lede={c.sustainability.lede}
          />
          <ul className="mt-8 flex list-none flex-col gap-4 p-0">
            {c.sustainability.items.map((f, i) => {
              const Icon = icons[i];
              return (
                <Reveal as="li" key={f.t} kind="fade-up" delay={i * 0.07}>
                  <div className="flex gap-3">
                    <Icon className="text-forest-700 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-caption">
                      <span className="text-forest-900 font-semibold">{f.t}.</span>{' '}
                      <span className="text-fg-muted">{f.d}</span>
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </div>
    </Section>
  );
}

export function MarketplaceFeatures({ c }: { c: LandingCopy }) {
  const icons = [MapPin, Star, RotateCcw, Boxes];
  return (
    <Section id="marketplace" tone="surface" aria-labelledby="mkt-h">
      <SectionHeader
        id="mkt-h"
        eyebrow={c.marketplace.eyebrow}
        accent="gold"
        title={c.marketplace.title}
      />
      <ul className="mt-12 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {c.marketplace.items.map((it, i) => {
          const Icon = icons[i];
          return (
            <Reveal as="li" key={it.t} kind="fade-up" delay={i * 0.06}>
              <div className="border-border bg-surface-raised flex h-full flex-col gap-3 rounded-2xl border p-7">
                <Icon className="text-forest-700 h-5 w-5" aria-hidden="true" />
                <h3 className="text-forest-900 font-semibold">{it.t}</h3>
                <p className="text-fg-muted text-caption leading-relaxed">{it.d}</p>
              </div>
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
}

/* FAQ — a real <details> list. No JS, keyboard-operable for free, and the
 * answers are indexable because they are in the HTML rather than behind a
 * click. Every answer is true of the product today. */
export function FAQ({ c }: { c: LandingCopy }) {
  return (
    <Section id="faq" tone="surface" aria-labelledby="faq-h">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <SectionHeader id="faq-h" eyebrow={c.faq.eyebrow} accent="leaf" title={c.faq.title} />
        <ul className="flex list-none flex-col p-0">
          {c.faq.qa.map((item, i) => (
            <Reveal as="li" key={item.q} kind="fade" delay={i * 0.04}>
              <details className="border-border group border-b">
                <summary className="text-forest-900 flex cursor-pointer items-center justify-between gap-4 py-5 text-body font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
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
export function Contact({ c }: { c: LandingCopy }) {
  const rows = [
    { icon: Phone, label: c.contact.phone },
    { icon: Mail, label: c.contact.email },
  ];
  return (
    <Section id="contact" tone="surface" aria-labelledby="contact-h">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <SectionHeader
          id="contact-h"
          eyebrow={c.contact.eyebrow}
          accent="forest"
          title={c.contact.title}
          lede={c.contact.lede}
        />
        <Reveal kind="fade-up">
          <ul className="flex list-none flex-col gap-4 p-0">
            {rows.map((r) => (
              <li
                key={r.label}
                className="border-border bg-surface-raised flex items-center gap-4 rounded-2xl border p-6"
              >
                <r.icon className="text-forest-700 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-forest-900 font-semibold">{r.label}</p>
                  {/* TODO(content): the real number lives in backend .env as
                      SUPPORT_PHONE and is not public. Put it here once confirmed. */}
                  <p className="text-fg-muted text-caption">{c.contact.pending}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}
