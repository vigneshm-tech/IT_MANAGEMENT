"use client";

import { createContext, useContext } from "react";

/**
 * True when page content may animate in. The launch intro holds it at `false`
 * while the overlay is up, then flips it as it fades out so grids stagger in
 * the moment the workspace is revealed — not behind the overlay.
 */
export const IntroRevealContext = createContext(true);

export function useIntroReveal(): boolean {
  return useContext(IntroRevealContext);
}
