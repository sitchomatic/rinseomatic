import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck, Key, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function UpdateApiKey() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
  });
  
  const settings = rows[0];
  const [apiKey, setApiKey] = React.useState('');
  
  React.useEffect(() => {
    if (settings?.scrapingbee_api_key) {
      setApiKey(settings.scrapingbee_api_key);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      // 1. Test key via our backend
      const res = await base44.functions.invoke('testScrapingBeeKey', { api_key: apiKey });
      const data = res.data;
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to validate API key');
      }
      
      // 2. Save it securely to our DB settings record
      if (settings?.id) {
        await base44.entities.AppSettings.update(settings.id, { scrapingbee_api_key: apiKey });
      } else {
        await base44.entities.AppSettings.create({ singleton_key: 'global', scrapingbee_api_key: apiKey });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('API key validated and saved securely.');
    },
    onError: (e) => {
      toast.error(e.message);
    }
  });

  const isSaved = settings?.scrapingbee_api_key === apiKey && apiKey.length > 0;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Security"
        title="Update API Key"
        description="Securely update and validate your ScrapingBee API key used for web scraping and proxy routing."
      />
      
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm max-w-2xl">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-medium">ScrapingBee Provider</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Provide a valid key to enable testing features.</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key..."
                className="font-mono text-sm h-10 max-w-md"
              />
              {isSaved && <span className="flex items-center text-xs text-emerald-500 gap-1 font-medium"><CheckCircle2 className="h-4 w-4" /> Active</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-2 max-w-md leading-relaxed">
              This key is securely verified against the ScrapingBee API before saving. It will override any environment variable fallbacks if set here.
            </p>
          </div>
          
          {saveMut.isError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-md flex items-start gap-2 mt-4 max-w-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>{saveMut.error.message}</div>
            </div>
          )}
          
          <div className="pt-4 flex items-center gap-3">
            <Button 
              onClick={() => saveMut.mutate()} 
              disabled={saveMut.isPending || !apiKey || isSaved}
              className="gap-2"
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {saveMut.isPending ? "Validating & Saving..." : "Validate & Save Key"}
            </Button>
            
            {apiKey && !isSaved && !saveMut.isPending && (
              <p className="text-[11px] text-amber-500 font-medium bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">Unsaved changes</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}