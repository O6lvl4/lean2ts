import { describe, it } from "vitest";

import fc from "fast-check";

import { arbStock } from "./arbitraries.js";

import { totalStock, reserve, cancelReservation, ship, restock } from "./stubs.js";

describe("properties", () => {
  it("reservePreservesTotal", () => {
    fc.assert(
      fc.property(arbStock, fc.nat(), (s, qty) => {
      return totalStock(reserve(s, qty)) === totalStock(s);
      })
    );
  });

  it("cancelPreservesTotal", () => {
    fc.assert(
      fc.property(arbStock, fc.nat(), (s, qty) => {
      return totalStock(cancelReservation(s, qty)) === totalStock(s);
      })
    );
  });

  it("shipDecreasesTotal", () => {
    fc.assert(
      fc.property(arbStock, fc.nat(), (s, qty) => {
      return totalStock(ship(s, qty)) <= totalStock(s);
      })
    );
  });

  it("restockIncreasesAvailable", () => {
    fc.assert(
      fc.property(arbStock, fc.nat(), (s, qty) => {
      return s.available <= restock(s, qty).available;
      })
    );
  });

  it("reserveAvailableLe", () => {
    fc.assert(
      fc.property(arbStock, fc.nat(), (s, qty) => {
      return reserve(s, qty).available <= s.available;
      })
    );
  });

  it("shipPreservesAvailable", () => {
    fc.assert(
      fc.property(arbStock, fc.nat(), (s, qty) => {
      return ship(s, qty).available === s.available;
      })
    );
  });
});
