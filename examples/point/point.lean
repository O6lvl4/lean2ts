import Init

-- 基本構造体 → interface
structure Point where
  x : Nat
  y : Nat

-- 基本 def → 関数スタブ
def double (n : Nat) : Nat := n * 2

-- 基本定理 → property test
theorem add_zero (n : Nat) : n + 0 = n := by simp
