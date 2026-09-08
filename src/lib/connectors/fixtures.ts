import type { RawDocument } from "../types";

/**
 * Sample corpora backing the mock connectors. Deliberately messy in the ways
 * real notes are: one source labels units "Week", the other "Lecture"; some
 * sections carry no marker at all and have to be inherited or inferred.
 */

export const NOTION_FIXTURES: RawDocument[] = [
  {
    externalId: "notion-algorithms-w1-3",
    title: "Algorithms — Weeks 1-3 Notes",
    kind: "notion",
    origin: "https://www.notion.so/Algorithms-Weeks-1-3",
    updatedAt: "2026-03-02T09:15:00.000Z",
    text: `# Week 1 — Analysis of Algorithms

## Asymptotic notation
We describe running time by how it grows, not by how many seconds it takes on one
machine. Big-O gives an upper bound: f(n) is O(g(n)) when there exist constants c
and n0 such that f(n) <= c*g(n) for all n >= n0. Big-Omega gives the matching lower
bound, and Big-Theta applies when both hold.

The point of asymptotic analysis is that constant factors and lower-order terms
stop mattering as input size grows. An O(n log n) sort beats an O(n^2) sort at
large n regardless of how tight the inner loop of the quadratic one is.

## Best, worst and average case
Worst case is the guarantee. Average case requires assuming a distribution over
inputs, which is often unrealistic — quicksort's O(n log n) average depends on
pivots landing near the median, and adversarial input drives it to O(n^2).

# Week 2 — Divide and Conquer

## The recurrence pattern
Divide and conquer splits a problem into subproblems, solves them recursively,
and combines the results. The cost is captured by a recurrence like
T(n) = a*T(n/b) + f(n), where a is the number of subproblems, n/b is their size,
and f(n) is the cost of splitting and combining.

## Master theorem
The master theorem reads the answer off the recurrence by comparing f(n) against
n^(log_b a). If f(n) grows polynomially slower, the leaves dominate and
T(n) = Theta(n^(log_b a)). If they grow at the same rate, T(n) = Theta(n^(log_b a) log n).
If f(n) grows faster and satisfies a regularity condition, the root dominates.

Merge sort is the canonical example: two subproblems of half the size plus a
linear merge gives T(n) = 2T(n/2) + n, which lands in the middle case at
Theta(n log n).

## Quicksort and pivot choice
Quicksort partitions around a pivot rather than merging afterwards. Randomised
pivot selection makes the O(n^2) worst case vanishingly unlikely without needing
any assumption about the input distribution. Median-of-three is the common
practical compromise.

# Week 3 — Dynamic Programming

## Optimal substructure and overlapping subproblems
Dynamic programming applies when a problem has optimal substructure — the optimal
solution is built from optimal solutions to subproblems — and those subproblems
recur. Naive recursion recomputes them; DP computes each once.

Memoisation is top-down: keep the recursion, cache the results. Tabulation is
bottom-up: fill a table in dependency order. They have the same asymptotic cost;
tabulation avoids recursion depth limits, memoisation avoids computing states
you never need.

## Worked example: 0/1 knapsack
With capacity W and items of weight w_i and value v_i, define OPT(i, c) as the best
value using the first i items within capacity c. Then
OPT(i, c) = max(OPT(i-1, c), v_i + OPT(i-1, c - w_i)) when w_i <= c.
The table is O(nW), which is pseudo-polynomial — it depends on the magnitude of W,
not just the number of bits used to write it down.

## Edit distance
The same shape solves edit distance between strings. The recurrence considers
insertion, deletion and substitution at each position and takes the cheapest,
giving an O(mn) table. Reconstructing the actual alignment means walking the
table backwards from the corner.`,
  },
  {
    externalId: "notion-algorithms-w4-6",
    title: "Algorithms — Weeks 4-6 Notes",
    kind: "notion",
    origin: "https://www.notion.so/Algorithms-Weeks-4-6",
    updatedAt: "2026-03-24T14:40:00.000Z",
    text: `# Week 4 — Greedy Algorithms

## When greedy is correct
A greedy algorithm commits to the locally best choice and never reconsiders. It is
correct only when the problem has the greedy-choice property: some optimal solution
contains the greedy first choice. Proving this usually goes by an exchange argument
— take any optimal solution, swap in the greedy choice, and show the result is no
worse.

## Interval scheduling
Given intervals with start and finish times, selecting the compatible interval that
finishes earliest is optimal. Sorting by finish time and sweeping gives O(n log n).
Sorting by start time or by duration both fail, and the counterexamples are small.

## Huffman coding
Huffman builds an optimal prefix-free code by repeatedly merging the two least
frequent symbols. The exchange argument here shows the two rarest symbols can
always be placed as siblings at maximum depth.

# Week 5 — Graph Traversal

## Representations
An adjacency list costs O(V + E) space and makes neighbour iteration cheap. An
adjacency matrix costs O(V^2) but answers edge queries in constant time. Dense
graphs favour the matrix; almost everything else favours the list.

## Breadth-first search
BFS explores in layers using a queue, and on an unweighted graph the layer a vertex
lands in is its shortest-path distance from the source. It runs in O(V + E).

## Depth-first search
DFS follows one path as far as it goes before backtracking. Its discovery and
finish times expose structure BFS does not: back edges reveal cycles, and finish
times in reverse order give a topological sort of a DAG.

# Week 6 — Shortest Paths

## Dijkstra's algorithm
Dijkstra repeatedly settles the unvisited vertex with the smallest tentative
distance, relaxing its outgoing edges. With a binary heap it runs in
O((V + E) log V). Correctness depends on non-negative edge weights: a negative edge
could improve a vertex after it has been settled, and Dijkstra never revisits.

## Bellman-Ford
Bellman-Ford relaxes every edge V-1 times, which handles negative weights at
O(VE). A V-th pass that still improves something proves a negative cycle exists.

## Choosing between them
Use Dijkstra when weights are non-negative and you want speed. Use Bellman-Ford
when negative weights are possible or when you need negative-cycle detection.`,
  },
  {
    externalId: "notion-exam-prep",
    title: "Exam prep — loose ends",
    kind: "notion",
    origin: "https://www.notion.so/Exam-prep-loose-ends",
    updatedAt: "2026-05-30T21:05:00.000Z",
    text: `Things I keep getting wrong

Amortised analysis
A dynamic array that doubles on overflow costs O(n) on the resize but O(1) on every
other push. Averaged over the sequence that is O(1) amortised. This is not the same
as average case: amortised analysis makes no assumption about the input, it just
accounts for cost across a sequence of operations.

Stability in sorting
A stable sort keeps equal elements in their original relative order. Merge sort is
stable, heapsort is not, and quicksort is not unless you go out of your way. It
matters when you sort by one key after another.

Hash table collisions
Chaining stores colliding keys in a list per bucket and degrades gracefully. Open
addressing probes for the next free slot and is faster while the load factor stays
low, but clusters badly as the table fills. Either way the O(1) average depends on
a good hash function spreading keys evenly.

Union-find
Union by rank plus path compression gives near-constant amortised time per
operation. Used inside Kruskal's algorithm to test whether adding an edge would
close a cycle.`,
  },
];

export const GDOCS_FIXTURES: RawDocument[] = [
  {
    externalId: "gdoc-stats-lectures-1-4",
    title: "Statistical Thinking — Lectures 1-4",
    kind: "gdocs",
    origin: "https://docs.google.com/document/d/stats-lectures-1-4",
    updatedAt: "2026-03-18T02:20:00.000Z",
    text: `Lecture 1: Data and Variation

Populations and samples
A population is every unit we care about; a sample is the subset we actually
measure. A statistic computed from a sample estimates a parameter of the
population. The gap between them is sampling error, and it shrinks as the sample
grows — but only if the sample is drawn properly.

Sampling bias
A biased sampling scheme does not improve with size. A survey of volunteers stays
unrepresentative at n = 10,000. Random sampling is what licenses the inference,
not the sample size.

Lecture 2: Probability Foundations

Conditional probability
P(A|B) = P(A and B) / P(B) whenever P(B) > 0. Two events are independent exactly
when P(A|B) = P(A), which is the same as saying P(A and B) = P(A)P(B).

Bayes' theorem
Bayes' theorem inverts a conditional: P(A|B) = P(B|A)P(A) / P(B). It is how we go
from the probability of the evidence given a hypothesis to the probability of the
hypothesis given the evidence.

The base rate matters enormously here. A test that is 99% accurate for a disease
affecting 1 in 10,000 people still produces mostly false positives, because the
99% multiplies a tiny prior while the 1% error rate multiplies a huge one. Ignoring
this is the base rate fallacy.

Lecture 3: Distributions

The normal distribution
Symmetric, defined by mean and standard deviation, with about 68% of mass within
one standard deviation and 95% within two. Its importance comes less from data
being normal than from sample means being approximately normal.

Central limit theorem
For a sufficiently large sample from any distribution with finite variance, the
sampling distribution of the mean is approximately normal, centred on the
population mean with standard deviation sigma/sqrt(n). This is what makes
confidence intervals and t-tests work on data that is nothing like normal itself.

Binomial and Poisson
The binomial counts successes in a fixed number of independent trials. The Poisson
counts events in a fixed interval when they occur independently at a constant rate,
and it is the limit of the binomial as n grows and p shrinks with np held fixed.

Lecture 4: Estimation

Confidence intervals
A 95% confidence interval is a procedure, not a probability about one interval:
across repeated samples, 95% of the intervals the procedure produces will contain
the true parameter. Any particular interval either contains it or does not.

Standard error
The standard error is the standard deviation of a sampling distribution. For a mean
it is sigma/sqrt(n), which is why halving the width of an interval costs four times
the sample size.`,
  },
  {
    externalId: "gdoc-stats-lectures-5-8",
    title: "Statistical Thinking — Lectures 5-8",
    kind: "gdocs",
    origin: "https://docs.google.com/document/d/stats-lectures-5-8",
    updatedAt: "2026-04-29T06:45:00.000Z",
    text: `Lecture 5: Hypothesis Testing

The logic of a test
We assume the null hypothesis, compute how surprising the observed data would be
under it, and reject if that surprise passes a threshold. The p-value is the
probability of data at least as extreme as observed, given the null is true. It is
not the probability that the null is true.

Type I and Type II errors
A Type I error rejects a true null — a false positive, occurring at rate alpha. A
Type II error fails to reject a false null, at rate beta. Power is 1 - beta, and it
rises with sample size, effect size, and alpha.

Lecture 6: Comparing Groups

t-tests
The one-sample t-test compares a sample mean against a hypothesised value; the
two-sample version compares two group means. The t-distribution has heavier tails
than the normal to account for estimating the standard deviation from the data,
converging to the normal as degrees of freedom grow.

Multiple comparisons
Running twenty independent tests at alpha = 0.05 gives roughly a 64% chance of at
least one false positive. Bonferroni divides alpha by the number of tests, which is
conservative; false discovery rate control is the usual alternative when the number
of tests is large.

Lecture 7: Regression

Simple linear regression
Fitting y = b0 + b1*x by least squares minimises the sum of squared residuals. The
slope b1 is the expected change in y per unit change in x, holding nothing else
constant because nothing else is in the model.

Assumptions
Linearity, independent errors, constant variance, and approximately normal
residuals. Residual plots diagnose the first three; the normality assumption
matters least, especially at large n.

Correlation and causation
Regression describes association. A confounder related to both x and y produces a
slope with no causal content whatsoever. Randomised assignment, not a better model,
is what licenses a causal reading.

Lecture 8: Multiple Regression

Adding predictors
With several predictors each coefficient is the effect of that variable holding the
others fixed. Correlated predictors — multicollinearity — make individual
coefficients unstable and hard to interpret even when the model predicts well.

Model selection
Adding predictors never decreases R-squared, so R-squared cannot be used to choose
between models of different size. Adjusted R-squared, AIC, and out-of-sample
validation all penalise complexity in different ways.`,
  },
  {
    externalId: "gdoc-tutorial-notes",
    title: "Tutorial scratch notes",
    kind: "gdocs",
    origin: "https://docs.google.com/document/d/tutorial-scratch",
    updatedAt: "2026-05-12T23:10:00.000Z",
    text: `Scratch notes from tutorials, mostly unsorted.

Something I finally understood about p-values: the threshold is a decision rule we
chose, not a fact about the world. p = 0.049 and p = 0.051 are essentially the same
evidence.

On the central limit theorem — the convergence rate depends on how skewed the
underlying distribution is. Heavily skewed data needs a much larger n before the
sampling distribution of the mean looks normal.

Bootstrapping: resample the data with replacement, recompute the statistic, repeat
thousands of times. The spread of those recomputed statistics estimates the
sampling distribution directly, without needing a formula for the standard error.
Useful when the statistic is a median or a ratio and no clean formula exists.

Regression to the mean is not a force. If a measurement has a random component,
extreme values are extreme partly by luck, and the luck does not repeat. This is why
the "best performers decline after praise" observation needs no behavioural
explanation at all.`,
  },
];
