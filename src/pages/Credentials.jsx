import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Upload, Play, KeyRound, Settings as SettingsIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import CredentialsTable from "@/components/credentials/CredentialsTable";
import CredentialDialog from "@/components/credentials/CredentialDialog";
import CsvImportDialog from "@/components/credentials/CsvImportDialog";
import BulkActionsBar from "@/components/credentials/BulkActionsBar";
import NewRunDialog from "@/components/runs/NewRunDialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Credentials() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [runOpen, setRunOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [siteFilter, setSiteFilter] = React.useState("all");
  const [selected, setSelected] = React.useState(new Set());
  const [confirmDelete, setConfirmDelete] = React.useState(null);
  const [confirmBulk, setConfirmBulk] = React.useState(false);

  const { data: sites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => base44.entities.Credential.list("-created_date", 2000),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Credential.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["credentials"] }); toast.success("Credential added"); },
  });
  const bulkMut = useMutation({
    mutationFn: (rows) => base44.entities.Credential.bulkCreate(rows),
    onSuccess: (_, rows) => { qc.invalidateQueries({ queryKey: ["credentials"] }); toast.success(`Imported ${rows.length}`); },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Credential.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials"] }),
  });
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => { await Promise.all(ids.map((id) => base44.entities.Credential.delete(id))); return ids.length; },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      setSelected(new Set());
      toast.success(`Deleted ${n} credential${n === 1 ? "" : "s"}`);
    },
  });

  const filtered = items.filter((c) => {
    if (siteFilter !== "all" && c.site_key !== siteFilter) return false;
    if (search && !(c.username || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleAll = () => setSelected((s) => s.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)));

  const selectedItems = items.filter((c) => selected.has(c.id));
  const runSiteKey = selectedItems[0]?.site_key;
  const sameSite = selectedItems.every((c) => c.site_key === runSiteKey);
  const canRunSelected = selectedItems.length > 0 && sameSite;

  const startRun = async ({ site_key, concurrency, max_retries, label }) => {
    const creds = selectedItems.length > 0 ? selectedItems : items.filter((c) => c.site_key === site_key);
    if (creds.length === 0) return toast.error("No credentials for this site");

    const run = await base44.entities.TestRun.create({
      label: label || `${creds.length} × ${site_key}`,
      site_key, concurrency, max_retries,
      status: "queued",
      total_count: creds.length,
      pending_count: creds.length,
    });

    await base44.entities.TestResult.bulkCreate(
      creds.map((c) => ({
        run_id: run.id,
        credential_id: c.id,
        site_key: c.site_key,
        username: c.username,
        status: "queued",
      }))
    );
    toast.success(`Run started · ${creds.length} credentials`);
    navigate(`/runs/${run.id}`);
  };

  const siteCounts = sites.reduce((acc, s) => {
    acc[s.key] = items.filter((c) => c.site_key === s.key).length;
    return acc;
  }, {});

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="01 · vault"
        title="Credentials"
        description="Stored credentials tested against real sites via ScrapingBee."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
            <Button size="sm" className="gap-2"
              onClick={() => setRunOpen(true)}
              disabled={items.length === 0 || (selected.size > 0 && !sameSite)}
              title={selected.size > 0 && !sameSite ? "Selected credentials must share one site" : undefined}
            >
              <Play className="h-3.5 w-3.5" />
              {canRunSelected ? `Test ${selected.size} selected` : "Test all"}
            </Button>
          </>
        }
      />

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <Tabs value={siteFilter} onValueChange={setSiteFilter}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="all">All <span className="ml-2 text-muted-foreground font-mono">{items.length}</span></TabsTrigger>
            {sites.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>
                {s.label} <span className="ml-2 text-muted-foreground font-mono">{siteCounts[s.key] || 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm md:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username..." className="pl-9 font-mono h-9" />
        </div>
      </div>

      {sitesLoading || itemsLoading ? (
        <div className="rounded-xl border border-border bg-card/40 py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : sites.length === 0 ? (
        <EmptyState
          icon={SettingsIcon}
          title="No sites configured yet"
          description="Add the sites you want to test credentials against, including login URL and success markers."
          action={<Button size="sm" onClick={() => navigate("/settings")}>Go to settings</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Your vault is empty"
          description="Add a single credential or import a CSV to get started."
          action={
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Import CSV
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add credential
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <BulkActionsBar
            count={selected.size}
            sameSite={sameSite}
            onClear={() => setSelected(new Set())}
            onRun={() => setRunOpen(true)}
            onDelete={() => setConfirmBulk(true)}
          />
          <CredentialsTable
            items={filtered}
            sites={sites}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onDelete={(c) => setConfirmDelete(c)}
          />
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete credential?"
        description={confirmDelete ? `${confirmDelete.username} will be permanently removed.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDelete) deleteMut.mutate(confirmDelete.id); setConfirmDelete(null); }}
      />

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Delete ${selected.size} credentials?`}
        description="This is permanent and cannot be undone."
        confirmLabel={`Delete ${selected.size}`}
        destructive
        onConfirm={() => bulkDeleteMut.mutate(Array.from(selected))}
      />

      <CredentialDialog open={addOpen} onOpenChange={setAddOpen} sites={sites} onSubmit={(d) => createMut.mutate(d)} />
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} sites={sites} onImport={(rows) => bulkMut.mutate(rows)} />
      <NewRunDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        sites={sites}
        defaultSiteKey={runSiteKey || (siteFilter !== "all" ? siteFilter : undefined)}
        lockedSiteKey={canRunSelected ? runSiteKey : undefined}
        countsBySite={
          selectedItems.length > 0
            ? { [runSiteKey]: selectedItems.length }
            : siteCounts
        }
        onCreate={startRun}
      />
    </div>
  );
}