import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getListBotsQueryKey,
  getGetBotsStatsQueryKey,
  useImportBotFromGithub,
  useImportBotFromUrl,
} from "@workspace/api-client-react";
import { UploadCloud, Loader2, Github, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ─── Schemas ─────────────────────────────────────────────────────────────── */

const uploadSchema = z.object({
  name: z.string().min(1, "Bot name is required").max(50),
});

const githubSchema = z.object({
  name: z.string().min(1, "Bot name is required").max(50),
  repoUrl: z.string().url("Enter a valid URL").min(1, "Repo URL is required"),
  mainFile: z.string().min(1, "Main file path is required"),
  branch: z.string().optional(),
  token: z.string().optional(),
});

const urlSchema = z.object({
  name: z.string().min(1, "Bot name is required").max(50),
  fileUrl: z.string().url("Enter a valid URL").min(1, "File URL is required"),
});

type UploadForm = z.infer<typeof uploadSchema>;
type GithubForm = z.infer<typeof githubSchema>;
type UrlForm = z.infer<typeof urlSchema>;

/* ─── Shared helpers ──────────────────────────────────────────────────────── */

function invalidateBots(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetBotsStatsQueryKey() });
}

/* ─── Upload tab ──────────────────────────────────────────────────────────── */

function UploadTab({ onSuccess }: { onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = async (data: UploadForm) => {
    if (!file) {
      toast({ title: "Error", description: "Please select a file to upload.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("file", file);
      const response = await fetch("/api/bots/upload", { method: "POST", body: formData });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "Failed to upload bot");
      }
      toast({ title: "Bot deployed", description: `"${data.name}" is ready.` });
      invalidateBots(queryClient);
      onSuccess();
    } catch (e: unknown) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bot Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. MusicBot, ModerationBot" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-1.5">
          <label className="text-sm font-medium leading-none">Source File</label>
          <div className="mt-2 flex justify-center rounded-lg border border-dashed border-border px-6 py-8 hover:bg-muted/50 transition-colors">
            <div className="text-center">
              <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-4 flex text-sm leading-6 text-muted-foreground justify-center">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer rounded-md font-semibold text-primary hover:text-primary/80"
                >
                  <span>Upload a file</span>
                  <input
                    id="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".js,.mjs,.cjs,.py"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {file ? file.name : "JS, MJS, CJS, PY up to 10MB"}
              </p>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={isUploading || !file} className="w-full">
          {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isUploading ? "Deploying..." : "Deploy Bot"}
        </Button>
      </form>
    </Form>
  );
}

/* ─── GitHub tab ──────────────────────────────────────────────────────────── */

function GithubTab({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importGithub = useImportBotFromGithub();

  const form = useForm<GithubForm>({
    resolver: zodResolver(githubSchema),
    defaultValues: { name: "", repoUrl: "", mainFile: "index.js", branch: "", token: "" },
  });

  const onSubmit = (data: GithubForm) => {
    importGithub.mutate(
      {
        data: {
          name: data.name,
          repoUrl: data.repoUrl,
          mainFile: data.mainFile,
          ...(data.branch ? { branch: data.branch } : {}),
          ...(data.token ? { token: data.token } : {}),
        },
      },
      {
        onSuccess: (result) => {
          toast({ title: "Bot imported", description: `"${result.bot.name}" cloned from GitHub.` });
          invalidateBots(queryClient);
          onSuccess();
        },
        onError: (e: unknown) => {
          toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bot Name</FormLabel>
              <FormControl>
                <Input placeholder="My Discord Bot" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="repoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repository URL</FormLabel>
              <FormControl>
                <Input placeholder="https://github.com/user/my-bot" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="mainFile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entry File</FormLabel>
                <FormControl>
                  <Input placeholder="index.js" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="branch"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Branch (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="main" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="token"
          render={({ field }) => (
            <FormItem>
              <FormLabel>GitHub Token (private repos)</FormLabel>
              <FormControl>
                <Input type="password" placeholder="ghp_xxxxxxxxxxxx" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={importGithub.isPending} className="w-full">
          {importGithub.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {importGithub.isPending ? "Cloning..." : "Import from GitHub"}
        </Button>
      </form>
    </Form>
  );
}

/* ─── Replit / URL tab ────────────────────────────────────────────────────── */

function UrlTab({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importUrl = useImportBotFromUrl();

  const form = useForm<UrlForm>({
    resolver: zodResolver(urlSchema),
    defaultValues: { name: "", fileUrl: "" },
  });

  const onSubmit = (data: UrlForm) => {
    importUrl.mutate(
      { data: { name: data.name, fileUrl: data.fileUrl } },
      {
        onSuccess: (result) => {
          toast({ title: "Bot imported", description: `"${result.bot.name}" fetched successfully.` });
          invalidateBots(queryClient);
          onSuccess();
        },
        onError: (e: unknown) => {
          toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bot Name</FormLabel>
              <FormControl>
                <Input placeholder="My Discord Bot" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fileUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Raw File URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://raw.githubusercontent.com/... or Replit raw URL"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <p className="text-xs text-muted-foreground">
          Paste any direct link to a .js or .py file — including Replit raw URLs or GitHub raw content URLs.
        </p>

        <Button type="submit" disabled={importUrl.isPending} className="w-full">
          {importUrl.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {importUrl.isPending ? "Fetching..." : "Import from URL"}
        </Button>
      </form>
    </Form>
  );
}

/* ─── Main dialog ─────────────────────────────────────────────────────────── */

export function UploadBotDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-lg shadow-primary/20">
          <UploadCloud className="w-4 h-4" />
          Deploy Bot
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deploy New Bot</DialogTitle>
          <DialogDescription>
            Upload a file, clone from GitHub, or import from any raw URL.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="gap-1.5">
              <UploadCloud className="w-3.5 h-3.5" /> Upload
            </TabsTrigger>
            <TabsTrigger value="github" className="gap-1.5">
              <Github className="w-3.5 h-3.5" /> GitHub
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> URL / Replit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <UploadTab onSuccess={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="github">
            <GithubTab onSuccess={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="url">
            <UrlTab onSuccess={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
