import Image from "next/image";
import { Wordmark } from "@/components/brand";

export function BrandPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-[#05070d] lg:block">
      <Image
        src="/brand/login-background.jpg"
        alt=""
        aria-hidden
        fill
        priority
        sizes="(min-width: 1024px) 52vw, 100vw"
        className="object-cover object-center"
      />

      {/* Flat scrim: keeps the wordmark and footer legible over the brightest facets. */}
      <div aria-hidden className="absolute inset-0 bg-[#05070d]/30" />

      <div className="relative flex h-full flex-col justify-between px-12 py-10 xl:px-16">
        <Wordmark tone="light" height={26} priority />
        <p className="text-[11px] text-white/40">© {new Date().getFullYear()} TaskTornado</p>
      </div>
    </section>
  );
}
