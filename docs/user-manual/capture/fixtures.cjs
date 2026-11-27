// Fictional demo data for manual screenshots. Snake_case rows, as PostgREST returns them.
const S = "11111111-0000-4000-8000-000000000001";
const ME = "22222222-0000-4000-8000-000000000001";
const Y1 = "33333333-0000-4000-8000-000000000001";
const Y2 = "33333333-0000-4000-8000-000000000002";
let n = 0;
const uid = (p) => `${p}-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const studies = [{ id: S, name: "Community Health Study", created_at: "2025-09-01T08:00:00Z" }];
const study_members = [
  {
    study_id: S,
    user_id: ME,
    email: "amina.otieno@example.org",
    role: "admin",
    added_at: "2025-09-01T08:00:00Z",
  },
  {
    study_id: S,
    user_id: uid("44444444"),
    email: "peter.kamau@example.org",
    role: "member",
    added_at: "2025-09-03T08:00:00Z",
  },
  {
    study_id: S,
    user_id: uid("44444444"),
    email: "grace.wanjiru@example.org",
    role: "member",
    added_at: "2025-09-05T08:00:00Z",
  },
];
const budget_periods = [
  {
    id: Y1,
    study_id: S,
    project_name: "Community Health Study",
    name: "Year 1 (2025/26)",
    start_date: "2025-09-30",
    end_date: "2026-09-29",
    fx_rate: 129,
    currency: "KES",
    status: "closed",
  },
  {
    id: Y2,
    study_id: S,
    project_name: "Community Health Study",
    name: "Year 2 (2026/27)",
    start_date: "2026-09-30",
    end_date: "2027-09-29",
    fx_rate: 129,
    currency: "KES",
    status: "open",
  },
];
const sites = [
  { id: uid("55555555"), study_id: S, name: "Kisumu", sort_order: 1, archived_at: null },
  { id: uid("55555555"), study_id: S, name: "Nakuru", sort_order: 2, archived_at: null },
  { id: uid("55555555"), study_id: S, name: "Machakos", sort_order: 3, archived_at: null },
];
const [KSM, NKR, MCK] = sites.map((s) => s.id);

const objectives = [],
  outcomes = [],
  activities = [],
  activity_indicators = [],
  activity_responsibles = [],
  activity_sites = [];
const budget_lines = [],
  budget_events = [],
  deliveries = [],
  delivery_indicator_results = [],
  attachments = [];

function obj(code, title, sort) {
  const o = {
    id: uid("66666666"),
    study_id: S,
    period_id: Y2,
    code,
    title,
    sort_order: sort,
    copied_from_id: null,
  };
  objectives.push(o);
  return o.id;
}
function outc(objective_id, code, title, sort) {
  const o = {
    id: uid("77777777"),
    study_id: S,
    objective_id,
    code,
    title,
    sort_order: sort,
    copied_from_id: null,
  };
  outcomes.push(o);
  return o.id;
}
function act(outcome_id, a) {
  const row = {
    id: uid("88888888"),
    study_id: S,
    outcome_id,
    code: a.code,
    title: a.title,
    kind: a.kind,
    output: a.output ?? "",
    means_of_verification: a.mov ?? "",
    frequency_label: a.freq ?? "",
    repeat_every: a.every ?? null,
    repeat_unit: a.unit ?? null,
    notes: "",
    sort_order: a.sort,
    copied_from_id: null,
  };
  activities.push(row);
  (a.sites ?? []).forEach((site_id) =>
    activity_sites.push({ study_id: S, activity_id: row.id, site_id }),
  );
  (a.people ?? []).forEach((name, i) =>
    activity_responsibles.push({
      id: uid("99999999"),
      study_id: S,
      activity_id: row.id,
      name,
      user_id: null,
      sort_order: i,
    }),
  );
  const ind = (a.indicators ?? []).map(([name, target], i) => {
    const r = {
      id: uid("aaaaaaaa"),
      study_id: S,
      activity_id: row.id,
      name,
      target,
      sort_order: i,
      copied_from_id: null,
    };
    activity_indicators.push(r);
    return r.id;
  });
  return { id: row.id, ind };
}
// events: array of {date, status, actual?:{date, qty, cost, dur}, evidence?:bool, location}
function line(activity_id, l, events) {
  const row = {
    id: uid("bbbbbbbb"),
    study_id: S,
    activity_id,
    group_label: l.group ?? null,
    description: l.desc,
    quantity: l.qty,
    quantity_unit: l.unit,
    unit_cost_cents: l.cost * 100,
    duration: l.dur,
    duration_unit: l.durUnit,
    occurrences: events.length,
    justification: l.why ?? null,
    cost_category: l.cat ?? null,
    finance_posted_cents: l.posted ?? null,
    sort_order: l.sort,
    copied_from_id: null,
  };
  budget_lines.push(row);
  events.forEach((e, i) => {
    const ev = {
      id: uid("cccccccc"),
      study_id: S,
      line_id: row.id,
      sequence: i + 1,
      title: `${l.desc} #${i + 1}`,
      planned_date: e.date ?? null,
      location: e.location ?? null,
      status: e.status ?? "planned",
      actual_date: e.actual?.date ?? null,
      actual_quantity: e.actual?.qty ?? null,
      actual_unit_cost_cents: e.actual ? e.actual.cost * 100 : null,
      actual_duration: e.actual?.dur ?? null,
      notes: e.notes ?? null,
      delivery_id: e.delivery ?? null,
    };
    budget_events.push(ev);
    if (e.evidence)
      attachments.push({
        id: uid("dddddddd"),
        study_id: S,
        event_id: ev.id,
        delivery_id: null,
        file_name: e.evidence,
        file_url: `storage:${S}/${ev.id}/${e.evidence}`,
        mime_type: "application/pdf",
        size_bytes: 184320,
        label: "Receipt",
        uploaded_at: (e.actual?.date ?? "2026-10-01") + "T12:00:00Z",
      });
  });
  return row.id;
}
function round(activity_id, site_id, roundNumber, r) {
  const d = {
    id: uid("eeeeeeee"),
    study_id: S,
    activity_id,
    site_id,
    round_number: roundNumber,
    round_label: r.label ?? "",
    planned_date: r.planned ?? null,
    actual_date: r.actual ?? null,
    status: r.status,
    notes: r.notes ?? "",
  };
  deliveries.push(d);
  (r.results ?? []).forEach(([indicator_id, value]) =>
    delivery_indicator_results.push({
      study_id: S,
      delivery_id: d.id,
      indicator_id,
      value,
      notes: "",
    }),
  );
  if (r.proof)
    attachments.push({
      id: uid("dddddddd"),
      study_id: S,
      event_id: null,
      delivery_id: d.id,
      file_name: r.proof,
      file_url: `storage:${S}/deliveries/${d.id}/${r.proof}`,
      mime_type: "application/pdf",
      size_bytes: 96256,
      label: "Signed attendance list",
      uploaded_at: r.actual + "T15:00:00Z",
    });
  return d.id;
}

// Objective 1
const o1 = obj("1", "Improve the skills of community health workers", 1);
const oc11 = outc(o1, "1.1", "Community health workers trained in case management", 1);
const a111 = act(oc11, {
  code: "1.1.1",
  title: "Quarterly refresher training for community health workers",
  kind: "site",
  sort: 1,
  output: "120 health workers trained",
  mov: "Signed attendance list",
  freq: "Quarterly",
  every: 3,
  unit: "months",
  sites: [KSM, NKR],
  people: ["Peter Kamau", "Grace Wanjiru"],
  indicators: [
    ["Health workers trained", 120],
    ["Training sessions held", 8],
  ],
});
const r1k = round(a111.id, KSM, 1, {
  label: "Baseline",
  planned: "2026-10-14",
  actual: "2026-10-15",
  status: "completed",
  proof: "kisumu-attendance.pdf",
  results: [
    [a111.ind[0], 32],
    [a111.ind[1], 1],
  ],
});
const r1n = round(a111.id, NKR, 1, {
  label: "Baseline",
  planned: "2026-10-14",
  actual: "2026-10-16",
  status: "completed",
  results: [
    [a111.ind[0], 28],
    [a111.ind[1], 1],
  ],
});
round(a111.id, KSM, 2, { planned: "2027-01-13", status: "planned" });
round(a111.id, NKR, 2, { planned: "2027-01-14", status: "in_progress", notes: "Venue booked" });
round(a111.id, KSM, 3, { planned: "2027-04-14", status: "planned" });
round(a111.id, NKR, 3, { planned: "2027-04-15", status: "planned" });
line(
  a111.id,
  {
    desc: "Training venue hire",
    qty: 1,
    unit: "venue",
    cost: 15000,
    dur: 2,
    durUnit: "days",
    cat: "Contractual",
    sort: 1,
    why: "Hall for two days at each site",
    posted: 3000000,
  },
  [
    {
      date: "2026-10-15",
      status: "done",
      location: "Kisumu",
      actual: { date: "2026-10-15", qty: 1, cost: 15000, dur: 2 },
      evidence: "venue-invoice-kisumu.pdf",
      delivery: r1k,
    },
    {
      date: "2026-10-16",
      status: "done",
      location: "Nakuru",
      actual: { date: "2026-10-16", qty: 1, cost: 16500, dur: 2 },
      delivery: r1n,
    },
    { date: "2027-01-13", location: "Kisumu" },
    { date: "2027-01-14", location: "Nakuru" },
  ],
);
line(
  a111.id,
  {
    desc: "Participant lunch and refreshments",
    qty: 30,
    unit: "pax",
    cost: 800,
    dur: 2,
    durUnit: "days",
    cat: "Supplies",
    sort: 2,
  },
  [
    {
      date: "2026-10-15",
      status: "done",
      location: "Kisumu",
      actual: { date: "2026-10-15", qty: 32, cost: 800, dur: 2 },
      evidence: "catering-receipt.pdf",
    },
    {
      date: "2026-10-16",
      status: "done",
      location: "Nakuru",
      actual: { date: "2026-10-16", qty: 28, cost: 750, dur: 2 },
      evidence: "catering-receipt-nakuru.pdf",
    },
    { date: "2027-01-13", location: "Kisumu" },
    { date: "2027-01-14", location: "Nakuru" },
  ],
);
line(
  a111.id,
  {
    desc: "Participant transport refund",
    qty: 30,
    unit: "pax",
    cost: 500,
    dur: 2,
    durUnit: "days",
    cat: "Travel",
    sort: 3,
  },
  [
    {
      date: "2026-10-15",
      status: "done",
      actual: { date: "2026-10-15", qty: 32, cost: 500, dur: 2 },
      evidence: "transport-sheet.pdf",
    },
    {
      date: "2026-10-16",
      status: "done",
      actual: { date: "2026-10-16", qty: 28, cost: 500, dur: 2 },
    },
    { date: "2027-01-13" },
    { date: "2027-01-14" },
  ],
);

const a112 = act(oc11, {
  code: "1.1.2",
  title: "Monthly supportive supervision visits",
  kind: "general",
  sort: 2,
  output: "12 supervision reports",
  mov: "Supervision report",
  freq: "Monthly",
  every: 1,
  unit: "months",
  people: ["Amina Otieno"],
  indicators: [["Visits completed", 12]],
});
round(a112.id, null, 1, {
  planned: "2026-10-20",
  actual: "2026-10-21",
  status: "completed",
  proof: "october-report.pdf",
  results: [[a112.ind[0], 1]],
});
round(a112.id, null, 2, { planned: "2026-11-18", status: "in_progress" });
round(a112.id, null, 3, { planned: "2026-12-16", status: "planned" });
line(
  a112.id,
  {
    desc: "Supervisor transport",
    qty: 2,
    unit: "vehicles",
    cost: 6000,
    dur: 1,
    durUnit: "days",
    cat: "Travel",
    sort: 1,
  },
  [
    {
      date: "2026-10-20",
      status: "done",
      actual: { date: "2026-10-21", qty: 2, cost: 6500, dur: 1 },
      evidence: "fuel-receipt.pdf",
    },
    { date: "2026-11-18" },
    { date: "2026-12-16" },
    { date: "2027-01-20" },
    { date: "2027-02-17" },
    { date: "2027-03-17" },
    {},
    {},
  ],
);

// Objective 2
const o2 = obj("2", "Raise community awareness of malaria prevention", 2);
const oc21 = outc(o2, "2.1", "Households reached with prevention messages", 1);
const a211 = act(oc21, {
  code: "2.1.1",
  title: "Community health days",
  kind: "site",
  sort: 1,
  output: "Two health days per site",
  mov: "Photos and attendance register",
  freq: "Twice a year",
  every: 6,
  unit: "months",
  sites: [MCK],
  people: ["Grace Wanjiru"],
  indicators: [["People reached", 1500]],
});
round(a211.id, MCK, 1, {
  planned: "2026-11-07",
  actual: "2026-11-07",
  status: "completed",
  results: [[a211.ind[0], 820]],
});
round(a211.id, MCK, 2, { planned: "2027-05-08", status: "planned" });
line(
  a211.id,
  {
    desc: "Sound system hire",
    qty: 1,
    unit: "sets",
    cost: 12000,
    dur: 1,
    durUnit: "days",
    cat: "Contractual",
    sort: 1,
  },
  [
    {
      date: "2026-11-07",
      status: "done",
      location: "Machakos",
      actual: { date: "2026-11-07", qty: 1, cost: 14500, dur: 1 },
    },
    { date: "2027-05-08", location: "Machakos" },
  ],
);
line(
  a211.id,
  {
    desc: "Printed leaflets",
    qty: 2000,
    unit: "units",
    cost: 25,
    dur: 1,
    durUnit: "one-off",
    cat: "Supplies",
    sort: 2,
  },
  [{ date: "2026-11-02", status: "planned", location: "Machakos" }],
);

act(oc21, {
  code: "2.1.2",
  title: "SMS reminders to households",
  kind: "general",
  sort: 2,
  output: "Monthly reminders sent",
  mov: "SMS delivery report",
  freq: "Monthly",
});

const audit_log = [
  [
    "budget_event",
    "status",
    "planned",
    "done",
    "2026-11-07T16:20:00Z",
    "grace.wanjiru@example.org",
  ],
  [
    "delivery",
    "status",
    "planned",
    "completed",
    "2026-11-07T16:18:00Z",
    "grace.wanjiru@example.org",
  ],
  [
    "budget_line",
    "unit_cost_cents",
    "1400000",
    "1500000",
    "2026-10-30T09:12:00Z",
    "amina.otieno@example.org",
  ],
  [
    "budget_event",
    "actual_unit_cost_cents",
    null,
    "650000",
    "2026-10-22T11:05:00Z",
    "peter.kamau@example.org",
  ],
  [
    "attachment",
    "file_name",
    null,
    "fuel-receipt.pdf",
    "2026-10-22T11:06:00Z",
    "peter.kamau@example.org",
  ],
  ["budget_period", "status", "open", "closed", "2026-10-01T07:45:00Z", "amina.otieno@example.org"],
].map(([entity, field, old_value, new_value, changed_at, changed_by]) => ({
  id: uid("ffffffff"),
  study_id: S,
  entity,
  entity_id: uid("ffffffff"),
  field,
  old_value,
  new_value,
  changed_at,
  changed_by,
}));

module.exports = {
  ME,
  S,
  Y1,
  Y2,
  tables: {
    studies,
    study_members,
    budget_periods,
    sites,
    objectives,
    outcomes,
    activities,
    activity_indicators,
    activity_responsibles,
    activity_sites,
    budget_lines,
    budget_events,
    deliveries,
    delivery_indicator_results,
    attachments,
    audit_log,
  },
};
