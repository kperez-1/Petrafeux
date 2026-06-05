import { Db, Quote, QuoteHistoryEvent, QuoteRoute } from "./types";
import { generateId } from "./utils";
import { generateQuoteNumber } from "./storage";

function cloneRoutes(routes: QuoteRoute[], newQuoteId: string): QuoteRoute[] {
  return routes.map((r, i) => ({
    ...r,
    id: generateId(),
    quoteId: newQuoteId,
    sortOrder: i,
  }));
}

export function duplicateQuote(db: Db, quoteId: string): { db: Db; newQuoteId: string } | null {
  const source = db.quotes.find((q) => q.id === quoteId);
  if (!source) return null;

  const counter = (db.meta.quoteCounter ?? 0) + 1;
  const newId = generateId();
  const now = new Date().toISOString();

  const duplicate: Quote = {
    ...source,
    id: newId,
    number: generateQuoteNumber(counter),
    status: "unsent",
    createdAt: now,
    sentAt: undefined,
    routes: cloneRoutes(source.routes, newId),
    history: [
      {
        id: generateId(),
        type: "created",
        at: now,
        note: `Duplicated from ${source.number}`,
      },
      {
        id: generateId(),
        type: "duplicated_from",
        at: now,
        note: source.number,
      },
    ],
  };

  return {
    db: {
      ...db,
      quotes: [duplicate, ...db.quotes],
      meta: { ...db.meta, quoteCounter: counter },
    },
    newQuoteId: newId,
  };
}

export function sendQuote(db: Db, quoteId: string): Db | null {
  const quote = db.quotes.find((q) => q.id === quoteId);
  if (!quote) return null;

  const now = new Date().toISOString();
  const event: QuoteHistoryEvent = {
    id: generateId(),
    type: "sent",
    at: now,
  };

  return {
    ...db,
    quotes: db.quotes.map((q) =>
      q.id === quoteId
        ? {
            ...q,
            status: "sent",
            sentAt: now,
            history: [...(q.history ?? []), event],
          }
        : q
    ),
  };
}

export function appendQuoteHistory(
  quote: Quote,
  type: QuoteHistoryEvent["type"],
  note?: string
): Quote {
  const at = new Date().toISOString();
  return {
    ...quote,
    history: [
      ...(quote.history ?? []),
      { id: generateId(), type, at, note },
    ],
  };
}
