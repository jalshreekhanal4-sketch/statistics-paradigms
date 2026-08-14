# Statistics in Three Paradigms

Mean, median, and mode of a list of integers, implemented three times — once in
each of three paradigms — for MSCS-632, Advanced Programming Languages.

| Language | Paradigm | Source |
|---|---|---|
| C | Procedural | [`c/statistics.c`](c/statistics.c) |
| OCaml | Functional | [`ocaml/statistics.ml`](ocaml/statistics.ml) |
| Python | Object-oriented | [`python/statistics_calculator.py`](python/statistics_calculator.py) |

All three accept integers as command-line arguments and fall back to a built-in
sample set when given none. All three produce byte-identical output.

## Building and running

```
# C
gcc -Wall -Wextra -std=c11 -o c/statistics c/statistics.c
./c/statistics 4 1 2 2 3 5 4 2 7 4

# OCaml
cd ocaml && ocamlopt statistics.ml -o statistics && ./statistics 4 1 2 2 3 5 4 2 7 4

# Python
python3 python/statistics_calculator.py 4 1 2 2 3 5 4 2 7 4
```

With no arguments each program uses the sample set `[4, 1, 2, 2, 3, 5, 4, 2, 7, 4]`,
which is deliberately bimodal so that the mode routine has to return more than
one value:

```
Input:          [4, 1, 2, 2, 3, 5, 4, 2, 7, 4]
Sorted:         [1, 2, 2, 2, 3, 4, 4, 4, 5, 7]

Count:          10
Mean:           3.4000
Median:         3.5000
Mode:           2, 4  (each occurring 3 times; the set is multimodal)
```

## Design notes

**C** stores the data in a heap array that `main` owns and frees. Insertion sort
and the mode scan are written out rather than delegated to `qsort`, so the
ordering and counting logic is visible. `compute_modes` allocates its result and
documents that the caller must release it. The sum accumulates into a `long long`
so that a large set of near-`INT_MAX` values cannot overflow.

**OCaml** uses no mutable state at all: no `ref`, no mutable fields, no loops.
Each statistic is a pure function built from `fold_left`, `filter`, `map`, and
`sort`. `mean` and `median` return `float option` so that the empty-list case is
visible in the type and cannot be ignored by a caller. Argument parsing folds a
`result` so the first bad argument short-circuits without an exception.

**Python** encapsulates the data in a `StatisticsCalculator`. The constructor
copies and validates the input once and caches the sorted form, so no method has
to revalidate. The data is private with a read-only property returning a copy,
which prevents outside code from mutating state the methods depend on.

## Testing

The three implementations were checked against each other on 306 data sets —
hand-picked edge cases (single element, two elements, all-identical, negatives,
even and odd counts, multimodal sets) plus 300 randomised sets — and produced
identical output on every one. All three also reject non-integer input with the
same message and the same exit status.

The C build compiles clean under `-Wall -Wextra`, reports `0 leaks for 0 total
leaked bytes` under `leaks --atExit`, and runs clean under AddressSanitizer and
UndefinedBehaviorSanitizer.
