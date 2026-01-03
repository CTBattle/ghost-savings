// Money stored as integer cents to avoid float bugs.
export type Cents = number;

export const money = {
  fromDollars(dollars: number): Cents {
    return Math.round(dollars * 100);
  },
  toDollars(cents: Cents): number {
    return Math.round(cents) / 100;
  },
  add(a: Cents, b: Cents): Cents {
    return a + b;
  },
  sub(a: Cents, b: Cents): Cents {
    return a - b;
  },
  mul(a: Cents, multiplier: number): Cents {
    return Math.round(a * multiplier);
  },
  pct(amount: Cents, percent: number): Cents {
    // percent like 10 = 10%
    return Math.round(amount * (percent / 100));
  }
};
