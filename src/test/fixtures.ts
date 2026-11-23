// Test fixtures for budgets under activities. Two shapes, so nothing depends on one study.
import { eventTitle } from "@/data/store";
import type { Activity, BudgetEvent, BudgetLine, Objective, Outcome } from "@/lib/types";

export interface Fixture {
  objectives: Objective[];
  outcomes: Outcome[];
  activities: Activity[];
  lines: BudgetLine[];
  events: BudgetEvent[];
}
type LineSpec = [string, number, string, number, number, string, number];

const act = (
  id: string,
  outcomeId: string,
  code: string,
  title: string,
  sortOrder = 1,
): Activity => ({
  id,
  outcomeId,
  code,
  title,
  kind: "general",
  output: "",
  meansOfVerification: "",
  frequencyLabel: "",
  notes: "",
  sortOrder,
});

function build(
  objectives: Objective[],
  outcomes: Outcome[],
  activities: Activity[],
  specs: Record<string, LineSpec[]>,
): Fixture {
  const lines: BudgetLine[] = [];
  const events: BudgetEvent[] = [];
  for (const [activityId, list] of Object.entries(specs))
    for (const [
      description,
      quantity,
      quantityUnit,
      unitCostCents,
      duration,
      durationUnit,
      occ,
    ] of list) {
      const id = `l${lines.length + 1}`;
      lines.push({
        id,
        activityId,
        description,
        quantity,
        quantityUnit,
        unitCostCents,
        duration,
        durationUnit,
        occurrences: occ,
        sortOrder: lines.length + 1,
      });
      for (let s = 1; s <= occ; s++)
        events.push({
          id: `e-${id}-${s}`,
          lineId: id,
          sequence: s,
          title: eventTitle(description, s, occ),
          status: "planned",
        });
    }
  return { objectives, outcomes, activities, lines, events };
}

/** A study shaped like PBIDS Detect: several objectives, sub-cent SMS rates. Rows total KES 5,875,204. */
export const PBIDS_TOTAL_CENTS = 587_520_400;
export function pbidsFixture(): Fixture {
  const obj = (id: string, code: string, title: string, sortOrder: number): Objective => ({
    id,
    periodId: "p1",
    code,
    title,
    sortOrder,
  });
  const out = (id: string, objectiveId: string, code: string, title: string): Outcome => ({
    id,
    objectiveId,
    code,
    title,
    sortOrder: 1,
  });
  return build(
    [
      obj("o1", "1", "Strengthen alert reporting", 1),
      obj("o2", "2", "Rapid field surveys", 2),
      obj("o3", "3", "Coordination", 3),
    ],
    [
      out("oc1", "o1", "1.1", "Platform running"),
      out("oc2", "o2", "2.1", "Surveys completed"),
      out("oc3", "o3", "3.1", "Review meetings held"),
    ],
    [
      act("a1", "oc1", "1.1.1", "Maintain short codes"),
      act("a2", "oc1", "1.1.2", "Airtime for verification"),
      act("a3", "oc2", "2.1.1", "Run SMS surveys"),
      act("a4", "oc2", "2.1.2", "Collect field data"),
      act("a5", "oc3", "3.1.1", "Regional review meetings"),
      act("a6", "oc3", "3.1.2", "Supervision visits"),
      act("a7", "oc3", "3.1.3", "Planned but not yet costed"),
    ],
    {
      a1: [
        ["Production short code", 10000, "SMS", 80, 1, "months", 12],
        ["Test short code", 1, "lines", 1_850_000, 1, "months", 12],
      ],
      a2: [["Alert verification airtime", 400, "units", 2500, 1, "months", 12]],
      a3: [["Bulk SMS for survey", 12000, "SMS", 106, 1, "one-off", 6]],
      a4: [
        ["Field interviewers", 3, "pax", 7_200_000, 1, "months", 6],
        ["Supplies and reporting", 1, "sets", 330_888_400, 1, "one-off", 1],
      ],
      a5: [["Venue for regional review", 25, "pax", 180_000, 1, "days", 4]],
      a6: [["Facilitator per diems", 6, "pax", 1_200_000, 4, "days", 2]],
    },
  );
}

/** A different shape: no sites, one objective, free-text units, an unfunded activity. */
export function livestockFixture(): Fixture {
  return build(
    [{ id: "x1", periodId: "y1", code: "", title: "Vaccinate herds", sortOrder: 1 }],
    [{ id: "xc1", objectiveId: "x1", code: "", title: "Herds protected", sortOrder: 1 }],
    [
      act("xa1", "xc1", "", "Run vaccination rounds"),
      act("xa2", "xc1", "", "Cold chain", 2),
      act("xa3", "xc1", "", "Community briefing", 3),
    ],
    {
      xa1: [["Vaccine doses", 5000, "doses", 45, 1, "one-off", 4]],
      xa2: [["Cooler boxes", 2, "boxes", 1_234_500, 3, "weeks", 1]],
    },
  );
}
