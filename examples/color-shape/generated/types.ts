export type Color =
  | { readonly tag: "red" }
  | { readonly tag: "green" }
  | { readonly tag: "blue" };

export function isRed(x: Color): x is Extract<Color, { tag: "red" }> {
  return x.tag === "red";
}

export function isGreen(x: Color): x is Extract<Color, { tag: "green" }> {
  return x.tag === "green";
}

export function isBlue(x: Color): x is Extract<Color, { tag: "blue" }> {
  return x.tag === "blue";
}

export type Shape =
  | { readonly tag: "circle"; readonly radius: number }
  | { readonly tag: "rect"; readonly width: number; readonly height: number }
  | { readonly tag: "point" };

export function isCircle(x: Shape): x is Extract<Shape, { tag: "circle" }> {
  return x.tag === "circle";
}

export function isRect(x: Shape): x is Extract<Shape, { tag: "rect" }> {
  return x.tag === "rect";
}

export function isPoint(x: Shape): x is Extract<Shape, { tag: "point" }> {
  return x.tag === "point";
}
