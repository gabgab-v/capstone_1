Table 18: Content-Based Filtering Table (Expanded)

Baseline user preferences (used for all scenarios)
| Parameter | Value |
| --- | --- |
| experience_level | Intermediate |
| preferred_difficulty | Intermediate |
| preferred_duration_hours | 6 |
| preferred_distance_km | 12 |
| preferred_elevation_m | 800 |
| budget_range | PHP 2000 - 3000 |
| preferred_trail_type | Mountain |

Event test inputs
| Scenario | Difficulty | Duration (hrs) | Price (PHP) | Trail type | Distance (km) | Elevation (m) |
| --- | --- | --- | --- | --- | --- | --- |
| Event A | Intermediate | 6 | 2500 | Mountain | 12 | 800 |
| Event B | Intermediate | 6 | 2500 | Forest | 12 | 800 |
| Event D | Beginner | 4 | 1500 | Mountain | 8 | 500 |
| Event C | Technical | 8 | 4000 | Forest | 18 | 1200 |
| Event X | Expert | 9 | 6000 | Forest | 24 | 1700 |

Preference match percents (per parameter)
| Scenario | Experience vs Difficulty | Preferred Difficulty vs Difficulty | Duration | Budget | Trail Type | Distance | Elevation | Match Score | Rank | Remarks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Event A | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 1 | Perfect match; all preferences align. |
| Event B | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 0.00 (0%) | 1.00 (100%) | 1.00 (100%) | 0.86 (86%) | 2 | Strong match; trail type mismatch lowers average. |
| Event D | 0.67 (67%) | 0.67 (67%) | 0.67 (67%) | 1.00 (100%) | 1.00 (100%) | 0.67 (67%) | 0.63 (63%) | 0.76 (76%) | 3 | Good match; easier difficulty but strong budget and trail type alignment. |
| Event C | 0.67 (67%) | 0.67 (67%) | 0.75 (75%) | 0.75 (75%) | 0.00 (0%) | 0.67 (67%) | 0.67 (67%) | 0.60 (60%) | 4 | Weak match; trail type mismatch and numeric gaps reduce score. |
| Event X | 0.33 (33%) | 0.33 (33%) | 0.67 (67%) | 0.50 (50%) | 0.00 (0%) | 0.50 (50%) | 0.47 (47%) | 0.40 (40%) | 5 | Weak; hidden if "Strong matches only" (threshold 0.75). |

Notes
- Match scores are the average of all listed percent values, following the logic in `src/utils/matchScoring.js`.
- Difficulty percent is computed from ordered gaps (Beginner, Intermediate, Technical, Expert).
- Numeric percents use `1 - |actual - preferred| / max(actual, preferred)`.
- Budget percent uses the upper cap of `budget_range` when available.
