import Init

-- enum 相当 → tagged union
inductive Color where
  | red
  | green
  | blue

-- フィールド付き帰納型 → 判別共用体 + 型ガード関数
inductive Shape where
  | circle (radius : Nat)
  | rect (width : Nat) (height : Nat)
  | point
