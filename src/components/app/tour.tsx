import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { driver, type Driver, type DriveStep, type Side } from "driver.js";
import { supabase } from "@/integrations/supabase/client";
import { useBudgetData } from "@/data/hooks";

type Path = "/" | "/activities" | "/budget" | "/spending" | "/settings";
type TourStep = { path: Path; el?: string; title: string; body: string; side?: Side };

// Bump the version when the steps change so everyone sees the new tour once.
const SEEN_KEY = "tour:v3:";

const nav = (k: string) =>
  window.matchMedia("(min-width: 768px)").matches
    ? `[data-tour="nav-${k}"]`
    : `[data-tour="nav-m-${k}"]`;
const at = (k: string) => `[data-tour="${k}"]`;

function tourSteps(): TourStep[] {
  return [
    {
      path: "/",
      title: "Welcome to Budget Tracker",
      body: "Here's a quick look at each page. It takes about a minute, and you can close it whenever you like.",
    },
    {
      path: "/",
      el: nav("dashboard"),
      title: "Dashboard",
      body: "Shows where the budget stands today: totals, burn rate and spending over time.",
    },
    {
      path: "/",
      el: at("dash-kpis"),
      title: "Headline figures",
      body: "Total budget, what's been spent and what's left. Projected balance also takes off what the planned events will still cost.",
    },
    {
      path: "/",
      el: at("dash-burn"),
      title: "Burn rate",
      body: "Compares what you've spent with what the plan expected by today, and with how much of the period has passed.",
    },
    {
      path: "/",
      el: at("currency"),
      title: "KES or USD",
      body: "Switches the currency amounts are shown in. Figures are kept in KES and converted at the period's exchange rate.",
      side: "bottom",
    },
    {
      path: "/",
      el: at("record-actuals"),
      title: "Record actuals",
      body: "The quickest way to log spending. Pick an event, enter what it cost and attach a receipt or other evidence.",
      side: "bottom",
    },
    {
      path: "/",
      el: at("year-switcher"),
      title: "Workplan year",
      body: "Each year has its own workplan and budget. Switch years here. A closed year can be viewed but not changed.",
      side: "bottom",
    },
    {
      path: "/activities",
      el: nav("activities"),
      title: "Activities",
      body: "The workplan: objectives, outcomes and the activities under them. Open an activity to track its rounds, and to add indicators, responsible people and sites.",
    },
    {
      path: "/activities",
      el: at("activities-tree"),
      title: "Objectives, outcomes and activities",
      body: "Add and reorder items, search, and filter by kind or status. Each activity shows its status and how many rounds are done, such as 2 of 5. Open an activity to create its rounds, set each round's status and add proof.",
      side: "top",
    },
    {
      path: "/budget",
      el: nav("budget"),
      title: "Budget",
      body: "Every planned cost, grouped by objective, outcome and activity.",
    },
    {
      path: "/budget",
      el: at("budget-objective"),
      title: "Objectives and lines",
      body: "Each line shows quantity, unit cost and how often it happens. Planned, actual and remaining update as spending is recorded. Click a line to open its details.",
      side: "top",
    },
    {
      path: "/budget",
      el: at("budget-add-line"),
      title: "Add a line",
      body: "Adds a cost to that activity. Activities without lines show as unfunded. Use the line menu to move a line to another activity.",
      side: "bottom",
    },
    {
      path: "/spending",
      el: nav("spending"),
      title: "Spending",
      body: "The dated spending records behind each budget line. Most day-to-day work happens here.",
    },
    {
      path: "/spending",
      el: at("spending-view"),
      title: "Three views",
      body: "See records grouped by line, as a single list, or on a calendar.",
      side: "bottom",
    },
    {
      path: "/spending",
      el: at("spending-tabs"),
      title: "Needs action",
      body: "These tabs sort events by status. Needs action collects events that are overdue, have no date yet, or are missing evidence.",
      side: "bottom",
    },
    {
      path: "/spending",
      el: at("spending-filters"),
      title: "Filters",
      body: "Narrow the list by activity, round, line, month or flag, or search by name. A spending record can be linked to a round of the same activity.",
      side: "bottom",
    },
    {
      path: "/settings",
      el: nav("settings"),
      title: "Settings",
      body: "Years, sites, Excel import and export, the audit log and your team.",
    },
    {
      path: "/settings",
      el: at("settings-tabs"),
      title: "Years, import and export",
      body: "Manage years and sites, load a budget from Excel, export reports, and see who changed what in the audit log.",
      side: "bottom",
    },
    {
      path: "/settings",
      el: at("settings-team"),
      title: "Team",
      body: "Add teammates here. Only team members can see or change the budget.",
      side: "bottom",
    },
    {
      path: "/settings",
      el: at("tour-replay"),
      title: "Take the tour again",
      body: "Click this button to start the tour over.",
      side: "bottom",
    },
  ];
}

const TourCtx = createContext<{ start: () => void }>({ start: () => {} });
export const useTour = () => useContext(TourCtx);

function readSeen(uid: string) {
  try {
    return localStorage.getItem(SEEN_KEY + uid) === "1";
  } catch {
    return false;
  }
}

function markSeen(uid: string) {
  try {
    localStorage.setItem(SEEN_KEY + uid, "1");
  } catch {
    /* tour just shows again next visit */
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready } = useBudgetData();
  const uid = useRef<string | null>(null);
  const active = useRef<Driver | null>(null);

  const start = useCallback(() => {
    active.current?.destroy();
    const steps = tourSteps();

    const goTo = (path: Path) => {
      if (router.state.location.pathname !== path) void router.navigate({ to: path });
    };
    const pathOf = (s: DriveStep | undefined) => s?.data?.path as Path | undefined;

    // Change page before moving so the next step's element can render.
    const move = (d: Driver, dir: 1 | -1) => {
      const target = steps[(d.getActiveIndex() ?? 0) + dir];
      if (!target) return d.destroy();
      goTo(target.path);
      if (dir === 1) d.moveNext();
      else d.movePrevious();
    };

    const d = driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      popoverClass: "app-tour",
      stageRadius: 8,
      overlayOpacity: 0.55,
      waitForElement: 2500,
      skipMissingElement: true,
      onNextClick: (_el, _step, { driver: dr }) => move(dr, 1),
      onPrevClick: (_el, _step, { driver: dr }) => move(dr, -1),
      onDestroyed: () => {
        if (uid.current) markSeen(uid.current);
        active.current = null;
      },
      steps: steps.map((s) => ({
        element: s.el,
        data: { path: s.path },
        // Skipped steps can cross pages without a click, so check the page here too.
        onHighlightStarted: (_el, step) => {
          const p = pathOf(step);
          if (p) goTo(p);
        },
        popover: { title: s.title, description: s.body, side: s.side },
      })),
    });
    active.current = d;
    goTo("/");
    d.drive(0);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (cancelled || !id) return;
      uid.current = id;
      if (!readSeen(id)) start();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, start]);

  useEffect(() => () => active.current?.destroy(), []);

  return <TourCtx.Provider value={{ start }}>{children}</TourCtx.Provider>;
}
