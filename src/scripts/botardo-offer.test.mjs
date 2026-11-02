import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldOfferContact } from "./botardo-offer.mjs";

test("offers contact only when offerContact is strictly true", () => {
  assert.equal(shouldOfferContact({ reply: "hola", offerContact: true }), true);
  assert.equal(shouldOfferContact({ reply: "hola", offerContact: false }), false);
  assert.equal(shouldOfferContact({ reply: "hola" }), false);
  assert.equal(shouldOfferContact({ reply: "hola", offerContact: "true" }), false);
  assert.equal(shouldOfferContact(null), false);
  assert.equal(shouldOfferContact(undefined), false);
});
