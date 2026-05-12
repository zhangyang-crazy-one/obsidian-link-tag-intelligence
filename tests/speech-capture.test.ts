import { describe, expect, it } from "vitest";
import { calculateRMS, rmsToDecibels } from "../src/speech-capture";

describe("calculateRMS", () => {
  it("returns 0 for all-zero samples", () => {
    const samples = new Float32Array([0, 0, 0, 0]);
    expect(calculateRMS(samples)).toBe(0);
  });

  it("returns 1.0 for all-one samples", () => {
    const samples = new Float32Array([1, 1, 1, 1]);
    expect(calculateRMS(samples)).toBe(1);
  });

  it("returns 0.5 for all-0.5 samples", () => {
    const samples = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    expect(calculateRMS(samples)).toBe(0.5);
  });

  it("squares negative samples correctly for [0, 0.5, 0, -0.5]", () => {
    const samples = new Float32Array([0, 0.5, 0, -0.5]);
    // sqrt(0.5/4) = sqrt(0.125) = 0.3535533905932738
    expect(calculateRMS(samples)).toBeCloseTo(Math.sqrt(0.125), 5);
  });

  it("returns 0 for empty array", () => {
    const samples = new Float32Array(0);
    expect(calculateRMS(samples)).toBe(0);
  });

  it("handles single sample", () => {
    const samples = new Float32Array([0.75]);
    expect(calculateRMS(samples)).toBe(0.75);
  });

  it("handles large array correctly", () => {
    const samples = new Float32Array(1000).fill(0.3);
    expect(calculateRMS(samples)).toBeCloseTo(0.3, 5);
  });
});

describe("rmsToDecibels", () => {
  it("returns approximately 0 dB for RMS = 1.0", () => {
    expect(rmsToDecibels(1.0)).toBeCloseTo(0, 1);
  });

  it("returns approximately -6.02 dB for RMS = 0.5", () => {
    expect(rmsToDecibels(0.5)).toBeCloseTo(-6.02, 1);
  });

  it("returns approximately -20 dB for RMS = 0.1", () => {
    expect(rmsToDecibels(0.1)).toBeCloseTo(-20, 1);
  });

  it("returns approximately -40 dB for RMS = 0.01", () => {
    expect(rmsToDecibels(0.01)).toBeCloseTo(-40, 1);
  });

  it("returns -Infinity for RMS = 0", () => {
    expect(rmsToDecibels(0)).toBe(-Infinity);
  });

  it("returns -Infinity for negative RMS", () => {
    expect(rmsToDecibels(-0.1)).toBe(-Infinity);
  });

  it("returns -Infinity for NaN RMS", () => {
    expect(rmsToDecibels(Number.NaN)).toBe(-Infinity);
  });
});
