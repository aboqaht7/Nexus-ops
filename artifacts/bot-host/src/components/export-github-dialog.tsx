import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useExportBotToGithub } from "@workspace/api-client-react";
import { Github, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  repoUrl: z.string().url("Enter a valid GitHub URL").min(1, "Repo URL is required"),
  token: z.string().min(1, "GitHub token is required"),
  path: z.string().optional(),
  commitMessage: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface ExportGithubDialogProps {
  botId: string;
  botName: string;
  botFilename: string;
}

export function ExportGithubDialog({ botId, botName, botFilename }: ExportGithubDialogProps) {
  const [open, setOpen] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const exportToGithub = useExportBotToGithub();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      repoUrl: "",
      token: "",
      path: botFilename,
      commitMessage: `Update ${botName} via NexusOps`,
    },
  });

  const onSubmit = (data: FormValues) => {
    setResultUrl(null);
    exportToGithub.mutate(
      {
        id: botId,
        data: {
          repoUrl: data.repoUrl,
          token: data.token,
          ...(data.path ? { path: data.path } : {}),
          ...(data.commitMessage ? { commitMessage: data.commitMessage } : {}),
        },
      },
      {
        onSuccess: (result) => {
          toast({ title: "Exported to GitHub", description: result.message });
          if (result.url) setResultUrl(result.url);
        },
        onError: (e: unknown) => {
          toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResultUrl(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-muted-foreground hover:text-foreground">
          <Github className="w-3.5 h-3.5" />
          Push
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export to GitHub</DialogTitle>
          <DialogDescription>
            Push <span className="font-mono text-primary">{botFilename}</span> to a GitHub repository.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
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

            <FormField
              control={form.control}
              name="token"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GitHub Personal Access Token</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="ghp_xxxxxxxxxxxx" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination Path</FormLabel>
                    <FormControl>
                      <Input placeholder="bot/index.js" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="commitMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commit Message</FormLabel>
                    <FormControl>
                      <Input placeholder="Update bot" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {resultUrl && (
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on GitHub
              </a>
            )}

            <Button type="submit" disabled={exportToGithub.isPending} className="w-full">
              {exportToGithub.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {exportToGithub.isPending ? "Pushing..." : "Push to GitHub"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
