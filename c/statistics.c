/*
 * statistics.c - mean, median and mode of a list of integers.
 *
 * Procedural implementation for MSCS-632. The program is one translation unit
 * built from free functions that transform data passed to them explicitly;
 * there are no objects and no closures. Storage is a heap array that the
 * caller owns and must release, since C has no garbage collector.
 *
 * Build: gcc -Wall -Wextra -std=c11 -o statistics statistics.c
 * Usage: ./statistics [int ...]      (with no arguments a sample set is used)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <limits.h>

/* Sample data used when the caller supplies no arguments. Deliberately
   bimodal so the mode routine has to return more than one value. */
static const int SAMPLE_DATA[] = {4, 1, 2, 2, 3, 5, 4, 2, 7, 4};
static const size_t SAMPLE_COUNT = sizeof(SAMPLE_DATA) / sizeof(SAMPLE_DATA[0]);

/*
 * Insertion sort, written out rather than delegated to qsort so that the
 * ordering logic is visible. O(n^2), which is irrelevant at these sizes and
 * keeps the control flow explicit.
 */
static void sort_ints(int *values, size_t n)
{
	for (size_t i = 1; i < n; i++) {
		int key = values[i];
		size_t j = i;
		while (j > 0 && values[j - 1] > key) {
			values[j] = values[j - 1];
			j--;
		}
		values[j] = key;
	}
}

/* Mean as a double so the fractional part is not silently truncated. */
static double compute_mean(const int *values, size_t n)
{
	long long sum = 0;   /* wider than int: 10^5 ints near INT_MAX would overflow */
	for (size_t i = 0; i < n; i++)
		sum += values[i];
	return (double)sum / (double)n;
}

/*
 * Median of an array that is already sorted. With an even count there is no
 * single middle element, so the two straddling values are averaged.
 */
static double compute_median(const int *sorted, size_t n)
{
	if (n % 2 == 1)
		return (double)sorted[n / 2];
	return ((double)sorted[n / 2 - 1] + (double)sorted[n / 2]) / 2.0;
}

/*
 * Mode of a sorted array. Because equal values are adjacent after sorting,
 * one pass counts each run and records the longest.
 *
 * A set may be multimodal, so the result is an array. It is allocated here and
 * becomes the caller's responsibility to free. *mode_count receives its length
 * and *frequency the winning run length.
 */
static int *compute_modes(const int *sorted, size_t n, size_t *mode_count, int *frequency)
{
	/* At most n distinct values, so this is always large enough. */
	int *modes = malloc(n * sizeof(int));
	if (modes == NULL) {
		perror("malloc");
		exit(EXIT_FAILURE);
	}

	size_t found = 0;
	int best = 0;

	size_t i = 0;
	while (i < n) {
		/* Walk to the end of the run of values equal to sorted[i]. */
		size_t run_start = i;
		while (i < n && sorted[i] == sorted[run_start])
			i++;
		int run_length = (int)(i - run_start);

		if (run_length > best) {
			/* Strictly better: discard everything collected so far. */
			best = run_length;
			found = 0;
			modes[found++] = sorted[run_start];
		} else if (run_length == best) {
			/* Ties are also modes. */
			modes[found++] = sorted[run_start];
		}
	}

	*mode_count = found;
	*frequency = best;
	return modes;
}

/*
 * Parse one argument into an int, rejecting junk and out-of-range values.
 * strtol is used rather than atoi because atoi cannot report failure.
 */
static int parse_int(const char *text, int *out)
{
	char *end = NULL;
	errno = 0;
	long value = strtol(text, &end, 10);

	if (end == text || *end != '\0')
		return 0;                       /* not a number, or trailing junk */
	if (errno == ERANGE || value > INT_MAX || value < INT_MIN)
		return 0;                       /* outside the range of int */

	*out = (int)value;
	return 1;
}

static void print_list(const char *label, const int *values, size_t n)
{
	printf("%-16s[", label);
	for (size_t i = 0; i < n; i++)
		printf("%d%s", values[i], (i + 1 < n) ? ", " : "");
	printf("]\n");
}

int main(int argc, char **argv)
{
	size_t n;
	int *values = NULL;

	if (argc > 1) {
		n = (size_t)(argc - 1);
		values = malloc(n * sizeof(int));
		if (values == NULL) {
			perror("malloc");
			return EXIT_FAILURE;
		}
		for (size_t i = 0; i < n; i++) {
			if (!parse_int(argv[i + 1], &values[i])) {
				fprintf(stderr, "error: '%s' is not a valid integer\n", argv[i + 1]);
				free(values);       /* release before the early exit */
				return EXIT_FAILURE;
			}
		}
	} else {
		n = SAMPLE_COUNT;
		values = malloc(n * sizeof(int));
		if (values == NULL) {
			perror("malloc");
			return EXIT_FAILURE;
		}
		memcpy(values, SAMPLE_DATA, n * sizeof(int));
		printf("No input given; using the built-in sample set.\n\n");
	}

	/* An empty data set has no mean, median or mode; say so rather than
	   dividing by zero. */
	if (n == 0) {
		fprintf(stderr, "error: no values to summarise\n");
		free(values);
		return EXIT_FAILURE;
	}

	print_list("Input:", values, n);

	/* Sorting in place is fine because the input order is not needed again.
	   Median and mode both require sorted data. */
	sort_ints(values, n);
	print_list("Sorted:", values, n);

	printf("\nCount:          %zu\n", n);
	printf("Mean:           %.4f\n", compute_mean(values, n));
	printf("Median:         %.4f\n", compute_median(values, n));

	size_t mode_count = 0;
	int frequency = 0;
	int *modes = compute_modes(values, n, &mode_count, &frequency);

	printf("Mode:           ");
	for (size_t i = 0; i < mode_count; i++)
		printf("%d%s", modes[i], (i + 1 < mode_count) ? ", " : "");
	printf("  (each occurring %d time%s", frequency, frequency == 1 ? "" : "s");
	if (mode_count > 1)
		printf("; the set is multimodal");
	printf(")\n");

	/* Every allocation above is released here. */
	free(modes);
	free(values);
	return EXIT_SUCCESS;
}
