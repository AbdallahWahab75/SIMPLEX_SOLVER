function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export const MAX_RATIONAL_BITS = 4096;

export class RationalPrecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RationalPrecisionError';
  }
}

export class Rational {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint, den: bigint = 1n) {
    if (den === 0n) {
      throw new Error('Division by zero in Rational');
    }
    let n = num;
    let d = den;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    if (n === 0n) {
      this.num = 0n;
      this.den = 1n;
      return;
    }
    const g = gcdBigInt(n, d);
    this.num = n / g;
    this.den = d / g;

    if (
      this.num.toString(2).length > MAX_RATIONAL_BITS ||
      this.den.toString(2).length > MAX_RATIONAL_BITS
    ) {
      throw new RationalPrecisionError(
        'Rational representation exceeded maximum safe bit length'
      );
    }
  }

  static readonly ZERO = new Rational(0n, 1n);
  static readonly ONE = new Rational(1n, 1n);
  static readonly NEG_ONE = new Rational(-1n, 1n);

  static fromInt(n: number | bigint): Rational {
    return new Rational(BigInt(n), 1n);
  }

  static parse(input: number | string): Rational | null {
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return null;
      if (Object.is(input, -0) || input === 0) return Rational.ZERO;
      if (Number.isInteger(input) && Number.isSafeInteger(input)) {
        return new Rational(BigInt(input), 1n);
      }
      return Rational.parseDecimalString(input.toString());
    }

    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Simple fraction: optional sign + digits / digits (no expressions)
    if (trimmed.includes('/')) {
      const match = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(trimmed);
      if (!match) return null;
      const num = BigInt(match[1]);
      const den = BigInt(match[2]);
      if (den === 0n) return null;
      return new Rational(num, den);
    }

    return Rational.parseDecimalString(trimmed);
  }

  private static parseDecimalString(raw: string): Rational | null {
    // Match standard decimal or scientific notation (e.g. -12.34, +0.5, 1e-6)
    const match = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(raw);
    if (!match) return null;

    const sign = match[1] === '-' ? -1n : 1n;
    const intPart = match[2] ?? '';
    const fracPart = match[3] ?? match[4] ?? '';
    const exp = match[5] ? Number.parseInt(match[5], 10) : 0;

    if (!Number.isFinite(exp) || Math.abs(exp) > 100) {
      return null;
    }

    const combinedDigits = `${intPart}${fracPart}`;
    if (!combinedDigits) return null;

    const digitsBig = BigInt(combinedDigits);
    if (digitsBig === 0n) return Rational.ZERO;

    const netShift = exp - fracPart.length;
    if (netShift >= 0) {
      return new Rational(sign * digitsBig * (10n ** BigInt(netShift)), 1n);
    }
    return new Rational(sign * digitsBig, 10n ** BigInt(-netShift));
  }

  add(other: Rational): Rational {
    return new Rational(this.num * other.den + other.num * this.den, this.den * other.den);
  }

  sub(other: Rational): Rational {
    return new Rational(this.num * other.den - other.num * this.den, this.den * other.den);
  }

  mul(other: Rational): Rational {
    if (this.num === 0n || other.num === 0n) return Rational.ZERO;
    return new Rational(this.num * other.num, this.den * other.den);
  }

  div(other: Rational): Rational {
    if (other.num === 0n) {
      throw new Error('Division by zero in Rational.div');
    }
    if (this.num === 0n) return Rational.ZERO;
    return new Rational(this.num * other.den, this.den * other.num);
  }

  neg(): Rational {
    if (this.num === 0n) return Rational.ZERO;
    return new Rational(-this.num, this.den);
  }

  abs(): Rational {
    return this.num < 0n ? this.neg() : this;
  }

  cmp(other: Rational): number {
    const diff = this.num * other.den - other.num * this.den;
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return 0;
  }

  equals(other: Rational): boolean {
    return this.num === other.num && this.den === other.den;
  }

  isZero(): boolean {
    return this.num === 0n;
  }

  isPositive(): boolean {
    return this.num > 0n;
  }

  isNegative(): boolean {
    return this.num < 0n;
  }

  toNumber(): number {
    if (this.num === 0n) return 0;
    const neg = this.num < 0n;
    const absN = neg ? -this.num : this.num;
    const absD = this.den;
    // Scale to avoid Infinity when num and den are huge BigInts
    const nBits = absN.toString(2).length;
    const dBits = absD.toString(2).length;
    const maxBits = Math.max(nBits, dBits);
    if (maxBits > 900) {
      const shift = BigInt(maxBits - 900);
      const scaledN = Number(absN >> shift);
      const scaledD = Number(absD >> shift);
      const val = scaledD === 0 ? Number.POSITIVE_INFINITY : scaledN / scaledD;
      return neg ? -val : val;
    }
    return Number(this.num) / Number(this.den);
  }

  toFractionString(): string {
    if (this.den === 1n) return this.num.toString();
    return `${this.num.toString()}/${this.den.toString()}`;
  }

  toFormattedValue(): { fraction: string; decimal: number } {
    return {
      fraction: this.toFractionString(),
      decimal: this.toNumber(),
    };
  }
}
