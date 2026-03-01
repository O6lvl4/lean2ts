import Init

/-!
# Pricing Rules

Business rules for discounts and tax calculations,
formally verified in Lean 4, automatically tested in TypeScript.
-/

/-- Discount applied to a price -/
inductive Discount where
  | none
  | percent (rate : Nat)
  | fixed (amount : Nat)

/-- A line item in an order -/
structure LineItem where
  unitPrice : Nat   -- in cents
  quantity : Nat

/-- Line subtotal = unit price × quantity -/
def lineTotal (item : LineItem) : Nat :=
  item.unitPrice * item.quantity

/-- Apply discount to an amount.
    Lean's Nat subtraction floors at 0, preventing negative prices. -/
def applyDiscount (amount : Nat) (d : Discount) : Nat :=
  match d with
  | .none => amount
  | .percent rate => amount - amount * rate / 100
  | .fixed v => amount - v

/-- Add tax to an amount (rate in percent) -/
def addTax (amount rate : Nat) : Nat :=
  amount + amount * rate / 100

-------------------------------------------------------
-- Business rules as theorems
-- → lean2ts converts these into property tests
-------------------------------------------------------

/-- Discounted price never exceeds the original price.
    In TypeScript, careless subtraction can produce negative values.
    This test catches that bug. -/
theorem discount_bounded (amount : Nat) (d : Discount) :
    applyDiscount amount d ≤ amount := by
  cases d <;> simp [applyDiscount] <;> omega

/-- Adding tax never decreases the price -/
theorem tax_increases (amount rate : Nat) :
    amount ≤ addTax amount rate := by
  simp [addTax]; omega
