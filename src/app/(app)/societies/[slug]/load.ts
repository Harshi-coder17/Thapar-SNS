import { notFound } from "next/navigation";
import { cache } from "react";

import { actorOf, getSociety } from "@/modules/societies";

import { requireSession } from "../../_lib/session";

/** The signed-in actor and the society for this URL (404 if it does not exist), once per render. */
export const loadSociety = cache(async (slug: string) => {
  const session = await requireSession();
  const actor = actorOf(session);
  const society = await getSociety(actor, slug);
  if (!society) notFound();
  return { session, actor, society };
});

/**
 * The society workspace (ADR-0013 §3.3): only for an active Head of this society, checked on the
 * server for every page render from the Head grant in the database. Anyone else, including a Head
 * whose access was just removed, gets a 404 (the API refuses them too).
 */
export const loadWorkspace = cache(async (slug: string) => {
  const loaded = await loadSociety(slug);
  if (!loaded.society.can["workspace.open"]) notFound();
  return loaded;
});
