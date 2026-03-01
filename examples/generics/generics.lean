import Init

-- 型パラメータ付き構造体 → TS ジェネリクス
structure Wrapper (α : Type) where
  value : α
  label : String

-- Prod → タプル
def swap {α β : Type} (p : α × β) : β × α := (p.2, p.1)

-- List + implicit → 配列 + ジェネリクス
def listHead {α : Type} (xs : List α) (default : α) : α :=
  match xs with
  | [] => default
  | x :: _ => x

-- 型クラス制約
def stringify [ToString α] (x : α) : String := toString x

-- 論理積の可換性 → property test
theorem and_comm_prop (a b : Prop) : a ∧ b → b ∧ a := by
  intro ⟨ha, hb⟩; exact ⟨hb, ha⟩
