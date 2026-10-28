/**
 * Contract with the chat worker: the LLM query router (PR #20) sets
 * `offerContact: true` in the /ask response when the visitor wants to hire
 * Ramiro. Only a strict `true` shows the contact offer; a missing field,
 * `false` or any other value shows nothing.
 * @param {unknown} data parsed /ask response body
 * @returns {boolean}
 */
export function shouldOfferContact(data) {
  return typeof data === "object" && data !== null && /** @type {{ offerContact?: unknown }} */ (data).offerContact === true;
}
