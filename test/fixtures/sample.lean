-- lean2ts テスト用サンプル

inductive RecordType where
  | revenue
  | salary

structure RevenueInput where
  monthlyRevenue : Nat
  expenses : List (String × Nat) := []

def totalExpenses (input : RevenueInput) : Nat :=
  input.expenses.foldl (fun acc pair => acc + pair.2) 0

theorem totalExpenses_empty (input : RevenueInput) :
  input.expenses = [] → totalExpenses input = 0 := by
  sorry

inductive Shape where
  | circle (radius : Nat)
  | rect (width : Nat) (height : Nat)
