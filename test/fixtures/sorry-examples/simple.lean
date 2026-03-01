import Init

structure Point where
  x : Nat
  y : Nat

def double (n : Nat) : Nat := n * 2

theorem add_zero (n : Nat) : n + 0 = n := by sorry
