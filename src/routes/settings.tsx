import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/shell";
import { TeamPanel } from "@/components/app/team-panel";
import { AuditLog } from "@/components/settings/audit-log";
import { ExportPanel } from "@/components/settings/export-panel";
import { ImportPanel } from "@/components/settings/import-panel";
import { SitesPanel } from "@/components/settings/sites-panel";
import { PeriodForm } from "@/components/settings/year-form";
import { YearsPanel } from "@/components/settings/years-panel";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Project Budget Tracker" },
      {
        name: "description",
        content: "Years, sites, exchange rate, Excel import/export and audit log.",
      },
      { property: "og:title", content: "Settings · Project Budget Tracker" },
      {
        property: "og:description",
        content: "Years, sites, exchange rate, Excel import/export and audit log.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs defaultValue="period">
        <TabsList className="h-auto flex-wrap" data-tour="settings-tabs">
          <TabsTrigger value="period">Year</TabsTrigger>
          <TabsTrigger value="years">Years</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="team" data-tour="settings-team">
            Team
          </TabsTrigger>
        </TabsList>
        <TabsContent value="period">
          <PeriodForm />
        </TabsContent>
        <TabsContent value="years">
          <YearsPanel />
        </TabsContent>
        <TabsContent value="sites">
          <SitesPanel />
        </TabsContent>
        <TabsContent value="import">
          <ImportPanel />
        </TabsContent>
        <TabsContent value="export">
          <ExportPanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditLog />
        </TabsContent>
        <TabsContent value="team">
          <TeamPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
