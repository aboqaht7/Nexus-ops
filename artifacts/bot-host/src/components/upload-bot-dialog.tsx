import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getListBotsQueryKey, getGetBotsStatsQueryKey } from "@workspace/api-client-react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const uploadSchema = z.object({
  name: z.string().min(1, "Bot name is required").max(50),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

export function UploadBotDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = async (data: UploadFormValues) => {
    if (!file) {
      toast({ title: "Error", description: "Please select a file to upload.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("file", file);

      const response = await fetch("/api/bots/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to upload bot");
      }

      toast({ title: "Success", description: "Bot uploaded successfully." });
      setOpen(false);
      form.reset();
      setFile(null);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: getListBotsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBotsStatsQueryKey() });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-lg shadow-primary/20">
          <UploadCloud className="w-4 h-4" />
          Deploy Bot
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deploy New Bot</DialogTitle>
          <DialogDescription>
            Upload your bot's source code file. We support JavaScript (.js, .mjs, .cjs) and Python (.py).
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
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
            
            <FormItem>
              <FormLabel>Source File</FormLabel>
              <div className="mt-2 flex justify-center rounded-lg border border-dashed border-border px-6 py-8 hover:bg-muted/50 transition-colors">
                <div className="text-center">
                  <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <div className="mt-4 flex text-sm leading-6 text-muted-foreground">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-transparent font-semibold text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background hover:text-primary/80"
                    >
                      <span>Upload a file</span>
                      <input 
                        id="file-upload" 
                        name="file-upload" 
                        type="file" 
                        className="sr-only" 
                        accept=".js,.mjs,.cjs,.py"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground mt-1">
                    {file ? file.name : "JS, MJS, CJS, PY up to 10MB"}
                  </p>
                </div>
              </div>
            </FormItem>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isUploading || !file} className="w-full sm:w-auto">
                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isUploading ? "Deploying..." : "Deploy Bot"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
