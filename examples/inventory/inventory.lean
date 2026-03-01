-- Inventory Management — 在庫管理の不変条件
--
-- 在庫 (Stock) の available / reserved を操作する関数群と、
-- 各操作が満たすべき性質を定理として証明する。

structure Stock where
  available : Nat
  reserved : Nat

def totalStock (s : Stock) : Nat :=
  s.available + s.reserved

/-- 引き当て: available から reserved に qty 個移動。在庫不足なら何もしない。 -/
def reserve (s : Stock) (qty : Nat) : Stock :=
  if qty ≤ s.available then
    ⟨s.available - qty, s.reserved + qty⟩
  else s

/-- 引き当てキャンセル: reserved から available に qty 個戻す。 -/
def cancelReservation (s : Stock) (qty : Nat) : Stock :=
  if qty ≤ s.reserved then
    ⟨s.available + qty, s.reserved - qty⟩
  else s

/-- 出荷: reserved から qty 個消費（在庫から除外）。 -/
def ship (s : Stock) (qty : Nat) : Stock :=
  if qty ≤ s.reserved then
    ⟨s.available, s.reserved - qty⟩
  else s

/-- 入庫: available に qty 個追加。 -/
def restock (s : Stock) (qty : Nat) : Stock :=
  ⟨s.available + qty, s.reserved⟩

-- ── 定理（不変条件） ──

/-- 引き当ては在庫総数を保存する -/
theorem reserve_preserves_total (s : Stock) (qty : Nat) :
    totalStock (reserve s qty) = totalStock s := by
  simp [reserve, totalStock]; split <;> omega

/-- キャンセルも在庫総数を保存する -/
theorem cancel_preserves_total (s : Stock) (qty : Nat) :
    totalStock (cancelReservation s qty) = totalStock s := by
  simp [cancelReservation, totalStock]; split <;> omega

/-- 出荷は在庫総数を超えない（出荷分だけ減る） -/
theorem ship_decreases_total (s : Stock) (qty : Nat) :
    totalStock (ship s qty) ≤ totalStock s := by
  simp [ship, totalStock]; split <;> omega

/-- 入庫は available を増やす -/
theorem restock_increases_available (s : Stock) (qty : Nat) :
    s.available ≤ (restock s qty).available := by
  simp [restock]; omega

/-- 引き当てで available は減る（か変わらない） -/
theorem reserve_available_le (s : Stock) (qty : Nat) :
    (reserve s qty).available ≤ s.available := by
  simp [reserve]; split <;> omega

/-- 出荷は available を変更しない -/
theorem ship_preserves_available (s : Stock) (qty : Nat) :
    (ship s qty).available = s.available := by
  simp [ship]; split <;> rfl
