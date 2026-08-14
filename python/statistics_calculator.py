"""statistics_calculator.py - mean, median and mode of a list of integers.

Object-oriented implementation for MSCS-632. The data and the operations that
act on it live together in a single class: the caller constructs a
StatisticsCalculator around a data set and then asks it questions, rather than
threading the list through free functions as the C version does.

Validation happens once, in the constructor, so no method has to re-check its
input. The data itself is kept private and exposed through a read-only
property, which is what stops a caller from putting the object into a state its
methods were not written to handle.

Usage: python3 statistics_calculator.py [int ...]
"""

from __future__ import annotations

import sys
from collections import Counter

# Deliberately bimodal, so mode() has to return more than one value.
SAMPLE_DATA = [4, 1, 2, 2, 3, 5, 4, 2, 7, 4]


class StatisticsCalculator:
    """Computes summary statistics for a fixed list of integers."""

    def __init__(self, data):
        # Copy the caller's list. Without this, code outside the object could
        # append to it later and silently invalidate the cached sort below.
        self._data = list(data)

        if not self._data:
            raise ValueError("data set must contain at least one integer")
        for value in self._data:
            # bool is a subclass of int, so it would otherwise slip through.
            if not isinstance(value, int) or isinstance(value, bool):
                raise TypeError(f"expected integers, found {value!r}")

        # Median and mode both need sorted data, so it is sorted once at
        # construction rather than on each call.
        self._sorted = sorted(self._data)

    # ---- encapsulated state ----

    @property
    def data(self):
        """The original data, as a copy so callers cannot mutate our state."""
        return list(self._data)

    @property
    def sorted_data(self):
        return list(self._sorted)

    def __len__(self):
        return len(self._data)

    # ---- the three statistics ----

    def mean(self):
        """Arithmetic mean of the data set."""
        return sum(self._data) / len(self._data)

    def median(self):
        """Middle value, averaging the two middle values for an even count."""
        n = len(self._sorted)
        mid = n // 2
        if n % 2 == 1:
            return float(self._sorted[mid])
        return (self._sorted[mid - 1] + self._sorted[mid]) / 2

    def mode(self):
        """Every value tied for the highest frequency.

        Returns a list because a data set may be multimodal. Counter does the
        tallying that the C version has to do by hand after sorting.
        """
        counts = Counter(self._data)
        highest = max(counts.values())
        return sorted(value for value, count in counts.items() if count == highest)

    def frequency(self):
        """How many times each modal value occurs."""
        return max(Counter(self._data).values())

    # ---- presentation ----

    def summary(self):
        """A formatted report of all three statistics."""
        modes = self.mode()
        plural = "" if self.frequency() == 1 else "s"
        multimodal = "; the set is multimodal" if len(modes) > 1 else ""

        return "\n".join([
            f"{'Input:':<15} {self._data}",
            f"{'Sorted:':<15} {self._sorted}",
            "",
            f"{'Count:':<15} {len(self)}",
            f"{'Mean:':<15} {self.mean():.4f}",
            f"{'Median:':<15} {self.median():.4f}",
            f"{'Mode:':<15} {', '.join(str(m) for m in modes)}"
            f"  (each occurring {self.frequency()} time{plural}{multimodal})",
        ])

    def __repr__(self):
        return f"StatisticsCalculator({self._data!r})"


def parse_args(argv):
    """Turn command-line arguments into a list of ints, or raise ValueError."""
    values = []
    for text in argv:
        try:
            values.append(int(text))
        except ValueError:
            raise ValueError(f"'{text}' is not a valid integer") from None
    return values


def main(argv):
    if argv:
        try:
            data = parse_args(argv)
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    else:
        data = SAMPLE_DATA
        print("No input given; using the built-in sample set.\n")

    try:
        calculator = StatisticsCalculator(data)
    except (TypeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(calculator.summary())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
