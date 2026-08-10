import type { Metadata } from "next";

export const metadata: Metadata = {
  // A plain string here (the previous value) breaks the root layout's own
  // "%s | BullPen" template for every page nested under /tools — confirmed
  // live: all ten tool pages' own titles rendered with no brand suffix once
  // they got real metadata. Redeclaring the same template here, rather than
  // hardcoding "| BullPen" into every child, is what makes it inherit
  // correctly instead.
  title: {
    template: "%s | BullPen",
    // Bare, not "Tools | BullPen" -- this default value is itself still
    // subject to the root layout's own template one level up, so a
    // pre-suffixed default here doubled it ("Tools | BullPen | BullPen"),
    // confirmed live. Children setting their own plain title don't hit this
    // -- they resolve through *this* layer's template and stop there.
    default: "Tools",
  },
  description: "Stock screener, price alerts, portfolio builder, and more: professional-grade investing tools.",
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
