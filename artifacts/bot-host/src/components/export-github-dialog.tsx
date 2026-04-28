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
  repoUrl: z.string().url("أدخل رابط GitHub صحيحاً").min(1, "رابط المستودع مطلوب"),
  token: z.string().min(1, "رمز GitHub مطلوب"),
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
      commitMessage: `تحديث ${botName} عبر NexusOps`,
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
        onSuccess: result => {
          toast({ title: "✓ تم الرفع إلى GitHub", description: result.message });
          if (result.url) setResultUrl(result.url);
        },
        onError: (e: unknown) => {
          toast({ title: "فشل الرفع", description: (e as Error).message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setResultUrl(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-muted-foreground hover:text-foreground">
          <Github className="w-3.5 h-3.5" />
          رفع
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>رفع إلى GitHub</DialogTitle>
          <DialogDescription>
            ارفع <span className="font-mono text-primary">{botFilename}</span> إلى مستودع GitHub.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="repoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رابط المستودع</FormLabel>
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
                  <FormLabel>رمز الوصول الشخصي لـ GitHub</FormLabel>
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
                    <FormLabel>مسار الوجهة</FormLabel>
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
                    <FormLabel>رسالة الـ Commit</FormLabel>
                    <FormControl>
                      <Input placeholder="تحديث البوت" {...field} />
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
                عرض على GitHub
              </a>
            )}

            <Button type="submit" disabled={exportToGithub.isPending} className="w-full">
              {exportToGithub.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              {exportToGithub.isPending ? "جاري الرفع..." : "رفع إلى GitHub"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
