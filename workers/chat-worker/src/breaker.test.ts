import { beforeEach, describe, expect, it } from "vitest";

import { isPrimaryGenerationOpen, notePrimaryGenerationFailure, resetPrimaryGenerationBreaker } from "./breaker";

describe("primary generation breaker", () => {
  beforeEach(() => resetPrimaryGenerationBreaker());

  it("starts closed", () => expect(isPrimaryGenerationOpen(1_000)).toBe(false));

  it("opens for the cooldown and then expires", () => {
    notePrimaryGenerationFailure(1_000, 500);
    expect(isPrimaryGenerationOpen(1_000)).toBe(true);
    expect(isPrimaryGenerationOpen(1_499)).toBe(true);
    expect(isPrimaryGenerationOpen(1_500)).toBe(false);
  });

  it("stays open across a shorter later note", () => {
    notePrimaryGenerationFailure(1_000, 10_000);
    notePrimaryGenerationFailure(2_000, 100);
    expect(isPrimaryGenerationOpen(5_000)).toBe(true);
  });

  it("a longer later note extends the window", () => {
    notePrimaryGenerationFailure(1_000, 100);
    notePrimaryGenerationFailure(1_050, 10_000);
    expect(isPrimaryGenerationOpen(5_000)).toBe(true);
  });

  it("reset closes it", () => {
    notePrimaryGenerationFailure(1_000, 10_000);
    resetPrimaryGenerationBreaker();
    expect(isPrimaryGenerationOpen(1_001)).toBe(false);
  });
});
