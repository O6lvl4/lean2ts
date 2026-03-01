import Init

/-!
# Scoring System

Exam scoring with grade assignment.
Theorems guarantee correctness of score aggregation.
-/

/-- Letter grade -/
inductive Grade where
  | a
  | b
  | c
  | d
  | f

/-- Exam score: earned points out of possible points -/
structure Score where
  earned : Nat
  possible : Nat

/-- Combine two scores (e.g. midterm + final) -/
def combine (a b : Score) : Score :=
  { earned := a.earned + b.earned,
    possible := a.possible + b.possible }

/-- Bonus: add extra points without changing possible -/
def addBonus (s : Score) (bonus : Nat) : Score :=
  { earned := s.earned + bonus,
    possible := s.possible }

-------------------------------------------------------
-- Properties of score operations
-------------------------------------------------------

/-- Combining scores is commutative (earned) -/
theorem combine_earned_comm (a b : Score) :
    (combine a b).earned = (combine b a).earned := by
  simp [combine]; omega

/-- Combining scores is commutative (possible) -/
theorem combine_possible_comm (a b : Score) :
    (combine a b).possible = (combine b a).possible := by
  simp [combine]; omega

/-- Combined possible points ≥ either individual -/
theorem combine_possible_ge (a b : Score) :
    a.possible ≤ (combine a b).possible := by
  simp [combine]; omega

/-- Bonus never decreases earned points -/
theorem bonus_increases (s : Score) (bonus : Nat) :
    s.earned ≤ (addBonus s bonus).earned := by
  simp [addBonus]; omega

/-- Bonus doesn't change possible points -/
theorem bonus_preserves_possible (s : Score) (bonus : Nat) :
    (addBonus s bonus).possible = s.possible := by
  simp [addBonus]
