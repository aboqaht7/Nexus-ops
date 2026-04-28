import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
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
import { Badge } from "@/components/ui/badge";
import {
  getListBotsQueryKey,
  getGetBotsStatsQueryKey,
  useImportBotFromGithub,
  useImportBotFromUrl,
} from "@workspace/api-client-react";
import { UploadCloud, Loader2, Github, Link2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ─── Schemas ──────────────────────────────────────────────────────────── */

const uploadSchema = z.object({ name: z.string().min(1, "اسم البوت مطلوب").max(50) });
const githubSchema = z.object({
  name: z.string().min(1, "اسم البوت مطلوب").max(50),
  repoUrl: z.string().url("أدخل رابطاً صحيحاً").min(1, "رابط المستودع مطلوب"),
  mainFile: z.string().min(1, "مسار الملف الرئيسي مطلوب"),
  branch: z.string().optional(),
  token: z.string().optional(),
});
const urlSchema = z.object({
  name: z.string().min(1, "اسم البوت مطلوب").max(50),
  fileUrl: z.string().url("أدخل رابطاً صحيحاً").min(1, "رابط الملف مطلوب"),
});

type UploadForm = z.infer<typeof uploadSchema>;
type GithubForm = z.infer<typeof githubSchema>;
type UrlForm = z.infer<typeof urlSchema>;

function invalidateBots(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: getListBotsQueryKey() });
  qc.invalidateQueries({ queryKey: getGetBotsStatsQueryKey() });
}

/* ─── القوالب الجاهزة ────────────────────────────────────────────────── */

const BOT_TEMPLATES = [
  {
    id: "ping-js",
    name: "بوت Ping (JS)",
    lang: "JS",
    description: "يرد على !ping بـ Pong — نقطة البداية الكلاسيكية.",
    color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    code: `// Ping Bot — Discord.js v14 starter
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log(\`Logged in as \${client.user.tag}\`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "!ping") {
    message.reply(\`Pong! Latency: \${client.ws.ping}ms\`);
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "slash-js",
    name: "أوامر Slash (JS)",
    lang: "JS",
    description: "Discord.js v14 مع أوامر /ping و /hello.",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    code: `// Slash Commands Bot — Discord.js v14
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
  new SlashCommandBuilder().setName("hello").setDescription("Say hello"),
].map(c => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(\`Ready as \${client.user.tag}\`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log("Slash commands registered");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "ping") {
    await interaction.reply(\`Pong! 🏓 \${client.ws.ping}ms\`);
  } else if (interaction.commandName === "hello") {
    await interaction.reply(\`Hello, \${interaction.user.username}! 👋\`);
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "mod-js",
    name: "بوت الإشراف (JS)",
    lang: "JS",
    description: "أوامر !kick و!ban و!mute — إشراف أساسي.",
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    code: `// Moderation Bot — Discord.js v14
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const PREFIX = "!";

client.once("ready", () => console.log(\`Mod Bot ready as \${client.user.tag}\`));

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

  const [cmd, ...args] = message.content.slice(PREFIX.length).trim().split(" ");
  const target = message.mentions.members?.first();

  if (cmd === "kick" && target) {
    await target.kick(args.slice(1).join(" ") || "No reason");
    message.reply(\`Kicked \${target.user.tag}\`);
  } else if (cmd === "ban" && target) {
    await target.ban({ reason: args.slice(1).join(" ") || "No reason" });
    message.reply(\`Banned \${target.user.tag}\`);
  } else if (cmd === "mute" && target) {
    const duration = parseInt(args[1] ?? "10") * 60_000;
    await target.timeout(duration);
    message.reply(\`Muted \${target.user.tag} for \${args[1] ?? "10"} minutes\`);
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "welcome-js",
    name: "بوت الترحيب (JS)",
    lang: "JS",
    description: "يرحب بالأعضاء الجدد برسالة مدمجة عند الانضمام.",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    code: `// Welcome Bot — Discord.js v14
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const WELCOME_CHANNEL = process.env.WELCOME_CHANNEL_ID;

client.once("ready", () => console.log(\`Welcome Bot ready as \${client.user.tag}\`));

client.on("guildMemberAdd", (member) => {
  const channel = WELCOME_CHANNEL
    ? member.guild.channels.cache.get(WELCOME_CHANNEL)
    : member.guild.systemChannel;
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle("أهلاً وسهلاً! 🎉")
    .setDescription(\`مرحباً بك في **\${member.guild.name}**، \${member}!\\nأنت العضو رقم \${member.guild.memberCount}.\`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(0x3b82f6)
    .setTimestamp();

  channel.send({ embeds: [embed] });
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "ping-py",
    name: "بوت Ping (Python)",
    lang: "PY",
    description: "بداية discord.py — يرد على !ping.",
    color: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    code: `# Ping Bot — discord.py
import discord
import os

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f"Logged in as {client.user}")

@client.event
async def on_message(message):
    if message.author == client.user:
        return
    if message.content == "!ping":
        latency = round(client.latency * 1000)
        await message.reply(f"Pong! {latency}ms")

client.run(os.environ["BOT_TOKEN"])
`,
  },
  {
    id: "logger-py",
    name: "بوت السجلات (Python)",
    lang: "PY",
    description: "يسجّل الانضمام والمغادرة والتعديلات والحذف في قناة مخصصة.",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    code: `# Event Logger — discord.py
import discord
import os

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
client = discord.Client(intents=intents)

LOG_CHANNEL_ID = int(os.environ.get("LOG_CHANNEL_ID", "0"))

async def log(guild, text):
    ch = guild.get_channel(LOG_CHANNEL_ID) or guild.system_channel
    if ch:
        await ch.send(text)

@client.event
async def on_ready():
    print(f"Logger ready as {client.user}")

@client.event
async def on_member_join(member):
    await log(member.guild, f"➕ **{member}** انضم للسيرفر.")

@client.event
async def on_member_remove(member):
    await log(member.guild, f"➖ **{member}** غادر السيرفر.")

@client.event
async def on_message_delete(message):
    if message.author.bot: return
    await log(message.guild, f"🗑️ **{message.author}** حذف: {message.content[:200]}")

@client.event
async def on_message_edit(before, after):
    if before.author.bot: return
    await log(before.guild, f"✏️ **{before.author}** عدّل: {before.content[:100]} → {after.content[:100]}")

client.run(os.environ["BOT_TOKEN"])
`,
  },
];

/* ─── تبويب القوالب ──────────────────────────────────────────────────── */

function TemplatesTab({ onSuccess }: { onSuccess: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  const template = BOT_TEMPLATES.find(t => t.id === selected);

  const deploy = async () => {
    if (!template || !customName.trim()) return;
    setDeploying(true);
    try {
      const blob = new Blob([template.code], { type: "text/plain" });
      const ext = template.lang === "PY" ? ".py" : ".js";
      const file = new File([blob], `${customName.trim().replace(/\s+/g, "_")}${ext}`);
      const formData = new FormData();
      formData.append("name", customName.trim());
      formData.append("file", file);

      const token = await getToken();
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/bots/upload`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || "فشل الرفع");
      }
      toast({ title: "✓ تم نشر القالب", description: `"${customName}" جاهز للتعديل.` });
      invalidateBots(queryClient);
      onSuccess();
    } catch (e: unknown) {
      toast({ title: "فشل النشر", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="pt-2 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {BOT_TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => { setSelected(t.id); setCustomName(t.name); }}
            className={cn(
              "text-right p-3 rounded-lg border transition-all text-sm",
              selected === t.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-card hover:border-border/80"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", t.color)}>
                {t.lang}
              </Badge>
              <span className="font-medium text-xs">{t.name}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t.description}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-3 pt-1 border-t border-border/50">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">اسم البوت</label>
            <Input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="مثال: بوت الموسيقى"
              className="h-9"
            />
          </div>
          <Button onClick={deploy} disabled={deploying || !customName.trim()} className="w-full">
            {deploying && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            {deploying ? "جاري النشر..." : `نشر قالب "${template?.name}"`}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── تبويب رفع الملف ────────────────────────────────────────────────── */

function UploadTab({ onSuccess }: { onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = async (data: UploadForm) => {
    if (!file) {
      toast({ title: "خطأ", description: "اختر ملفاً للرفع.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("file", file);

      const token = await getToken();
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${BASE}/api/bots/upload`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || "فشل الرفع");
      }
      toast({ title: "✓ تم نشر البوت", description: `"${data.name}" جاهز.` });
      invalidateBots(queryClient);
      onSuccess();
    } catch (e: unknown) {
      toast({ title: "فشل الرفع", description: (e as Error).message, variant: "destructive" });
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
              <FormLabel>اسم البوت</FormLabel>
              <FormControl>
                <Input placeholder="مثال: بوت الإشراف، بوت الموسيقى" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-1.5">
          <label className="text-sm font-medium leading-none">ملف الكود المصدري</label>
          <div className="mt-2 flex justify-center rounded-lg border border-dashed border-border px-6 py-8 hover:bg-muted/50 transition-colors">
            <div className="text-center">
              <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-4 flex text-sm leading-6 text-muted-foreground justify-center">
                <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-semibold text-primary hover:text-primary/80">
                  <span>ارفع ملفاً</span>
                  <input
                    id="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".js,.mjs,.cjs,.py"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="pr-1">أو اسحب وأفلت</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {file ? file.name : "JS، MJS، CJS، PY — حتى 10MB"}
              </p>
            </div>
          </div>
        </div>
        <Button type="submit" disabled={isUploading || !file} className="w-full">
          {isUploading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          {isUploading ? "جاري النشر..." : "نشر البوت"}
        </Button>
      </form>
    </Form>
  );
}

/* ─── تبويب GitHub ───────────────────────────────────────────────────── */

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
      { data: { name: data.name, repoUrl: data.repoUrl, mainFile: data.mainFile, ...(data.branch ? { branch: data.branch } : {}), ...(data.token ? { token: data.token } : {}) } },
      {
        onSuccess: result => { toast({ title: "✓ تم الاستيراد", description: `"${result.bot.name}" استُنسخ من GitHub.` }); invalidateBots(queryClient); onSuccess(); },
        onError: (e: unknown) => { toast({ title: "فشل الاستيراد", description: (e as Error).message, variant: "destructive" }); },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>اسم البوت</FormLabel><FormControl><Input placeholder="بوت Discord الخاص بي" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="repoUrl" render={({ field }) => (
          <FormItem><FormLabel>رابط المستودع</FormLabel><FormControl><Input placeholder="https://github.com/user/my-bot" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="mainFile" render={({ field }) => (
            <FormItem><FormLabel>الملف الرئيسي</FormLabel><FormControl><Input placeholder="index.js" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="branch" render={({ field }) => (
            <FormItem><FormLabel>الفرع (اختياري)</FormLabel><FormControl><Input placeholder="main" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="token" render={({ field }) => (
          <FormItem><FormLabel>رمز GitHub (للمستودعات الخاصة)</FormLabel><FormControl><Input type="password" placeholder="ghp_xxxxxxxxxxxx" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <Button type="submit" disabled={importGithub.isPending} className="w-full">
          {importGithub.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          {importGithub.isPending ? "جاري الاستنساخ..." : "استيراد من GitHub"}
        </Button>
      </form>
    </Form>
  );
}

/* ─── تبويب الرابط المباشر ───────────────────────────────────────────── */

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
        onSuccess: result => { toast({ title: "✓ تم الاستيراد", description: `"${result.bot.name}" جُلب بنجاح.` }); invalidateBots(queryClient); onSuccess(); },
        onError: (e: unknown) => { toast({ title: "فشل الاستيراد", description: (e as Error).message, variant: "destructive" }); },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>اسم البوت</FormLabel><FormControl><Input placeholder="بوت Discord الخاص بي" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="fileUrl" render={({ field }) => (
          <FormItem><FormLabel>رابط الملف المباشر</FormLabel><FormControl><Input placeholder="https://raw.githubusercontent.com/..." {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <p className="text-xs text-muted-foreground">الصق أي رابط مباشر لملف .js أو .py.</p>
        <Button type="submit" disabled={importUrl.isPending} className="w-full">
          {importUrl.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
          {importUrl.isPending ? "جاري الجلب..." : "استيراد من الرابط"}
        </Button>
      </form>
    </Form>
  );
}

/* ─── نافذة النشر الرئيسية ───────────────────────────────────────────── */

export function UploadBotDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-lg shadow-primary/20">
          <UploadCloud className="w-4 h-4" />
          نشر بوت
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>نشر بوت جديد</DialogTitle>
          <DialogDescription>
            ابدأ من قالب جاهز، ارفع ملفاً، استنسخ من GitHub، أو استورد من رابط مباشر.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="templates" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="templates" className="gap-1">
              <Sparkles className="w-3.5 h-3.5" /> القوالب
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1">
              <UploadCloud className="w-3.5 h-3.5" /> رفع ملف
            </TabsTrigger>
            <TabsTrigger value="github" className="gap-1">
              <Github className="w-3.5 h-3.5" /> GitHub
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-1">
              <Link2 className="w-3.5 h-3.5" /> رابط
            </TabsTrigger>
          </TabsList>
          <TabsContent value="templates"><TemplatesTab onSuccess={() => setOpen(false)} /></TabsContent>
          <TabsContent value="upload"><UploadTab onSuccess={() => setOpen(false)} /></TabsContent>
          <TabsContent value="github"><GithubTab onSuccess={() => setOpen(false)} /></TabsContent>
          <TabsContent value="url"><UrlTab onSuccess={() => setOpen(false)} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
