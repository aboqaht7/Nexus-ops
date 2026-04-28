import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
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
import { UploadCloud, Loader2, Github, Link2, Sparkles, Wand2, CheckCircle2 } from "lucide-react";
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

/* ─── القوالب الاحترافية ─────────────────────────────────────────────── */
const BOT_TEMPLATES = [
  {
    id: "moderation-pro",
    name: "الإشراف الاحترافي",
    lang: "JS",
    emoji: "🔨",
    description: "نظام تحذير كامل، حظر مؤقت، كتم، سجل المخالفات، أوامر Slash.",
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    tags: ["Slash", "Warn", "Timeout"],
    code: `// Moderation Pro — Discord.js v14
const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder,
        REST, Routes, SlashCommandBuilder } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers],
});

const warns = new Map(); // userId -> [{reason, date}]

const commands = [
  new SlashCommandBuilder().setName("warn")
    .setDescription("تحذير عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(true)),
  new SlashCommandBuilder().setName("warnings")
    .setDescription("عرض تحذيرات عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarns")
    .setDescription("مسح تحذيرات عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("mute")
    .setDescription("كتم عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("الدقائق").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب")),
  new SlashCommandBuilder().setName("kick")
    .setDescription("طرد عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب")),
  new SlashCommandBuilder().setName("ban")
    .setDescription("حظر عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب")),
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(\`✅ Mod Bot ready: \${client.user.tag}\`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers))
    return i.reply({ content: "❌ لا تملك صلاحية الإشراف.", ephemeral: true });

  const target = i.options.getMember("user");
  const reason = i.options.getString("reason") ?? "لم يُذكر سبب";

  const embed = (color, title, desc) =>
    new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setTimestamp();

  if (i.commandName === "warn" && target) {
    const list = warns.get(target.id) ?? [];
    list.push({ reason, date: new Date().toLocaleDateString("ar") });
    warns.set(target.id, list);
    await i.reply({ embeds: [embed(0xf59e0b, "⚠️ تحذير", \`<@\${target.id}> — **\${reason}**\\nإجمالي التحذيرات: \${list.length}\`)] });
    if (list.length >= 3) target.timeout(10 * 60_000, "3 تحذيرات").catch(() => {});
  }
  else if (i.commandName === "warnings" && target) {
    const list = warns.get(target.id) ?? [];
    const text = list.length ? list.map((w, n) => \`\${n+1}. \${w.reason} — \${w.date}\`).join("\\n") : "لا توجد تحذيرات";
    await i.reply({ embeds: [embed(0x6366f1, \`📋 تحذيرات \${target.user.username}\`, text)] });
  }
  else if (i.commandName === "clearwarns" && target) {
    warns.delete(target.id);
    await i.reply({ embeds: [embed(0x10b981, "✅ مُسحت التحذيرات", \`تم مسح جميع تحذيرات <@\${target.id}>\`)] });
  }
  else if (i.commandName === "mute" && target) {
    const mins = i.options.getInteger("minutes");
    await target.timeout(mins * 60_000, reason);
    await i.reply({ embeds: [embed(0xf97316, "🔇 كتم", \`<@\${target.id}> لمدة \${mins} دقيقة — \${reason}\`)] });
  }
  else if (i.commandName === "kick" && target) {
    await target.kick(reason);
    await i.reply({ embeds: [embed(0xef4444, "👢 طرد", \`<@\${target.id}> — \${reason}\`)] });
  }
  else if (i.commandName === "ban" && target) {
    await target.ban({ reason });
    await i.reply({ embeds: [embed(0x991b1b, "🔨 حظر", \`<@\${target.id}> — \${reason}\`)] });
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "levels-xp",
    name: "نظام المستويات والـ XP",
    lang: "JS",
    emoji: "⭐",
    description: "XP تلقائي عند الكتابة، أدوار المستويات، /rank، /leaderboard احترافي.",
    color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    tags: ["XP", "Roles", "Leaderboard"],
    code: `// XP & Levels System — Discord.js v14
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder,
        AttachmentBuilder } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

// userId -> { xp, level, lastMsg }
const users = new Map();
// مستويات → أدوار (اضبط الـ IDs من process.env)
const LEVEL_ROLES = {
  5:  process.env.ROLE_LVL5  ?? null,
  10: process.env.ROLE_LVL10 ?? null,
  20: process.env.ROLE_LVL20 ?? null,
};

function xpForLevel(lvl) { return 100 * lvl * lvl; }

const commands = [
  new SlashCommandBuilder().setName("rank").setDescription("عرض رتبتك أو رتبة عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو (اختياري)")),
  new SlashCommandBuilder().setName("leaderboard").setDescription("أفضل 10 أعضاء"),
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(\`⭐ Levels Bot ready: \${client.user.tag}\`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const now = Date.now();
  const data = users.get(msg.author.id) ?? { xp: 0, level: 0, lastMsg: 0 };
  if (now - data.lastMsg < 60_000) return; // cooldown دقيقة

  data.xp += Math.floor(Math.random() * 10) + 15;
  data.lastMsg = now;

  const needed = xpForLevel(data.level + 1);
  if (data.xp >= needed) {
    data.level++;
    data.xp -= needed;
    msg.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("🎉 ارتقيت مستوى!")
        .setDescription(\`مبروك \${msg.author}! وصلت للمستوى **\${data.level}** 🚀\`)
        .setThumbnail(msg.author.displayAvatarURL())
        .setTimestamp()],
    });
    // إضافة الدور إن وُجد
    const roleId = LEVEL_ROLES[data.level];
    if (roleId) {
      const role = msg.guild.roles.cache.get(roleId);
      if (role) msg.member.roles.add(role).catch(() => {});
    }
  }
  users.set(msg.author.id, data);
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "rank") {
    const target = i.options.getUser("user") ?? i.user;
    const data = users.get(target.id) ?? { xp: 0, level: 0 };
    const needed = xpForLevel(data.level + 1);
    const bar = "█".repeat(Math.floor((data.xp / needed) * 10)) + "░".repeat(10 - Math.floor((data.xp / needed) * 10));
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle(\`⭐ رتبة \${target.username}\`)
        .addFields(
          { name: "المستوى", value: \`\${data.level}\`, inline: true },
          { name: "XP", value: \`\${data.xp} / \${needed}\`, inline: true },
          { name: "التقدم", value: \`[\${bar}]\`, inline: false },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp()],
    });
  }

  if (i.commandName === "leaderboard") {
    const sorted = [...users.entries()]
      .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp)
      .slice(0, 10);
    const medals = ["🥇","🥈","🥉"];
    const lines = sorted.map(([id, d], n) =>
      \`\${medals[n] ?? \`\${n+1}.\`} <@\${id}> — مستوى \${d.level} (\${d.xp} XP)\`
    ).join("\\n") || "لا يوجد بيانات بعد";
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xf59e0b).setTitle("🏆 لوحة المتصدرين").setDescription(lines).setTimestamp()],
    });
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "tickets-pro",
    name: "نظام التذاكر",
    lang: "JS",
    emoji: "🎫",
    description: "تذاكر بالأزرار والـ Modal، قناة خاصة لكل تذكرة، إغلاق وأرشفة.",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    tags: ["Buttons", "Modal", "Channels"],
    code: `// Ticket System Pro — Discord.js v14
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
        ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
        TextInputStyle, PermissionFlagsBits, ChannelType, REST,
        Routes, SlashCommandBuilder } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const openTickets = new Map(); // userId -> channelId

const commands = [
  new SlashCommandBuilder().setName("panel")
    .setDescription("إرسال لوحة التذاكر في هذه القناة")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(\`🎫 Tickets Bot ready: \${client.user.tag}\`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on("interactionCreate", async (i) => {
  // /panel — إرسال اللوحة
  if (i.isChatInputCommand() && i.commandName === "panel") {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x3b82f6).setTitle("🎫 نظام التذاكر").setDescription(
          "هل تحتاج مساعدة؟ اضغط على الزر أدناه لفتح تذكرة دعم خاصة بك."
        )],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_open").setLabel("فتح تذكرة 🎫")
          .setStyle(ButtonStyle.Primary),
      )],
    });
  }

  // زر فتح تذكرة
  if (i.isButton() && i.customId === "ticket_open") {
    if (openTickets.has(i.user.id)) {
      return i.reply({ content: \`لديك تذكرة مفتوحة بالفعل: <#\${openTickets.get(i.user.id)}>\`, ephemeral: true });
    }
    const modal = new ModalBuilder().setCustomId("ticket_modal").setTitle("وصف مشكلتك");
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("issue").setLabel("ما المشكلة التي تواجهها؟")
        .setStyle(TextInputStyle.Paragraph).setMinLength(10).setRequired(true)
    ));
    await i.showModal(modal);
  }

  // إرسال Modal
  if (i.isModalSubmit() && i.customId === "ticket_modal") {
    const issue = i.fields.getTextInputValue("issue");
    const ch = await i.guild.channels.create({
      name: \`ticket-\${i.user.username}\`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
    openTickets.set(i.user.id, ch.id);
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0x3b82f6).setTitle(\`🎫 تذكرة \${i.user.username}\`)
        .setDescription(\`**المشكلة:**\\n\${issue}\`).setTimestamp()],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(\`ticket_close_\${i.user.id}\`).setLabel("إغلاق التذكرة 🔒")
          .setStyle(ButtonStyle.Danger),
      )],
    });
    await i.reply({ content: \`✅ تم فتح تذكرتك: \${ch}\`, ephemeral: true });
  }

  // إغلاق تذكرة
  if (i.isButton() && i.customId.startsWith("ticket_close_")) {
    const userId = i.customId.replace("ticket_close_", "");
    openTickets.delete(userId);
    await i.reply({ content: "🔒 جاري إغلاق التذكرة..." });
    setTimeout(() => i.channel.delete().catch(() => {}), 3000);
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "welcome-advanced",
    name: "الترحيب المتقدم",
    lang: "JS",
    emoji: "👋",
    description: "Embed احترافي عند الانضمام والمغادرة، رسالة DM، دور تلقائي.",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    tags: ["Embed", "AutoRole", "DM"],
    code: `// Advanced Welcome Bot — Discord.js v14
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes,
        SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// اضبط هذه القيم من متغيرات البيئة
const WELCOME_CHANNEL = process.env.WELCOME_CHANNEL_ID;
const FAREWELL_CHANNEL = process.env.FAREWELL_CHANNEL_ID ?? process.env.WELCOME_CHANNEL_ID;
const AUTO_ROLE_ID    = process.env.AUTO_ROLE_ID;

const commands = [
  new SlashCommandBuilder().setName("setwelcome")
    .setDescription("تعيين قناة الترحيب")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName("channel").setDescription("القناة").setRequired(true)),
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(\`👋 Welcome Bot ready: \${client.user.tag}\`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on("guildMemberAdd", async (member) => {
  // الدور التلقائي
  if (AUTO_ROLE_ID) {
    const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
    if (role) member.roles.add(role).catch(() => {});
  }

  // رسالة DM ترحيبية
  member.send({
    embeds: [new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(\`🎉 مرحباً في \${member.guild.name}!\`)
      .setDescription("نحن سعداء بانضمامك! اقرأ قواعد السيرفر والاستمتع بوقتك معنا.")
      .setThumbnail(member.guild.iconURL())
      .setTimestamp()],
  }).catch(() => {}); // بعض الأعضاء يعطلون DM

  // رسالة القناة
  const ch = WELCOME_CHANNEL
    ? member.guild.channels.cache.get(WELCOME_CHANNEL)
    : member.guild.systemChannel;
  if (!ch?.isTextBased()) return;

  ch.send({
    content: \`\${member}\`,
    embeds: [new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle("🎉 عضو جديد انضم!")
      .setDescription(\`مرحباً \${member} في **\${member.guild.name}**!\\nأنت العضو رقم **\${member.guild.memberCount}** 🎊\`)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "📅 تاريخ إنشاء الحساب", value: \`<t:\${Math.floor(member.user.createdTimestamp/1000)}:R>\`, inline: true },
        { name: "🆔 المعرّف", value: \`\\\`\${member.id}\\\`\`, inline: true },
      )
      .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() })
      .setTimestamp()],
  });
});

client.on("guildMemberRemove", (member) => {
  const ch = FAREWELL_CHANNEL
    ? member.guild.channels.cache.get(FAREWELL_CHANNEL)
    : member.guild.systemChannel;
  if (!ch?.isTextBased()) return;
  ch.send({
    embeds: [new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(\`👋 **\${member.user.tag}** غادر السيرفر. نتمنى له التوفيق!\`)
      .setTimestamp()],
  });
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName === "setwelcome") {
    const ch = i.options.getChannel("channel");
    // يمكنك حفظ ID القناة في قاعدة بيانات
    await i.reply({ content: \`✅ تم تعيين قناة الترحيب: \${ch}\`, ephemeral: true });
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "reaction-roles",
    name: "الأدوار التفاعلية",
    lang: "JS",
    emoji: "🎭",
    description: "أزرار لاختيار الأدوار، /setup-roles لإنشاء اللوحة، لا تتطلب ردود فعل.",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    tags: ["Buttons", "Roles", "Panel"],
    code: `// Reaction Roles (Button-based) — Discord.js v14
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
        ButtonBuilder, ButtonStyle, PermissionFlagsBits, REST,
        Routes, SlashCommandBuilder } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// اضبط الأدوار من متغيرات البيئة أو غيّرها مباشرة
const ROLE_CONFIG = [
  { id: process.env.ROLE_1_ID ?? "ROLE_ID_1", label: "🎮 الألعاب",    style: ButtonStyle.Primary },
  { id: process.env.ROLE_2_ID ?? "ROLE_ID_2", label: "🎵 الموسيقى",   style: ButtonStyle.Success },
  { id: process.env.ROLE_3_ID ?? "ROLE_ID_3", label: "💻 البرمجة",    style: ButtonStyle.Secondary },
  { id: process.env.ROLE_4_ID ?? "ROLE_ID_4", label: "🎨 التصميم",    style: ButtonStyle.Secondary },
  { id: process.env.ROLE_5_ID ?? "ROLE_ID_5", label: "📢 الإشعارات",  style: ButtonStyle.Danger },
];

const commands = [
  new SlashCommandBuilder().setName("setup-roles")
    .setDescription("إنشاء لوحة الأدوار التفاعلية في هذه القناة")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(\`🎭 Reaction Roles ready: \${client.user.tag}\`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on("interactionCreate", async (i) => {
  if (i.isChatInputCommand() && i.commandName === "setup-roles") {
    // تقسيم الأزرار (5 كحد أقصى في كل صف)
    const rows = [];
    for (let idx = 0; idx < ROLE_CONFIG.length; idx += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          ROLE_CONFIG.slice(idx, idx + 5).map(r =>
            new ButtonBuilder().setCustomId(\`role_\${r.id}\`).setLabel(r.label).setStyle(r.style)
          )
        )
      );
    }
    await i.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle("🎭 اختر أدوارك")
        .setDescription("اضغط على الزر المناسب للحصول على الدور أو إزالته.")
        .setFooter({ text: "يمكنك اختيار أكثر من دور" })],
      components: rows,
    });
    await i.reply({ content: "✅ تم إنشاء لوحة الأدوار!", ephemeral: true });
  }

  if (i.isButton() && i.customId.startsWith("role_")) {
    const roleId = i.customId.replace("role_", "");
    const role = i.guild.roles.cache.get(roleId);
    if (!role) return i.reply({ content: "❌ الدور غير موجود. تحقق من الإعدادات.", ephemeral: true });

    const member = i.guild.members.cache.get(i.user.id) ?? await i.guild.members.fetch(i.user.id);
    const hasRole = member.roles.cache.has(roleId);

    if (hasRole) {
      await member.roles.remove(role);
      await i.reply({ content: \`✅ تمت إزالة دور **\${role.name}**\`, ephemeral: true });
    } else {
      await member.roles.add(role);
      await i.reply({ content: \`✅ حصلت على دور **\${role.name}**\`, ephemeral: true });
    }
  }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "music-bot",
    name: "بوت الموسيقى",
    lang: "JS",
    emoji: "🎵",
    description: "تشغيل YouTube، قائمة انتظار، أوامر play/skip/stop/queue.",
    color: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    tags: ["Voice", "Queue", "YouTube"],
    code: `// Music Bot — Discord.js v14 + @discordjs/voice
// تحتاج: npm install @discordjs/voice ytdl-core @discordjs/opus
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes,
        SlashCommandBuilder } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource,
        AudioPlayerStatus, VoiceConnectionStatus } = require("@discordjs/voice");
const ytdl = require("ytdl-core");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

const queues = new Map(); // guildId -> { connection, player, songs[], textChannel }

const commands = [
  new SlashCommandBuilder().setName("play").setDescription("تشغيل أغنية من YouTube")
    .addStringOption(o => o.setName("url").setDescription("رابط YouTube").setRequired(true)),
  new SlashCommandBuilder().setName("skip").setDescription("تخطي الأغنية الحالية"),
  new SlashCommandBuilder().setName("stop").setDescription("إيقاف الموسيقى ومغادرة القناة"),
  new SlashCommandBuilder().setName("queue").setDescription("عرض قائمة الانتظار"),
  new SlashCommandBuilder().setName("pause").setDescription("إيقاف مؤقت"),
  new SlashCommandBuilder().setName("resume").setDescription("متابعة التشغيل"),
].map(c => c.toJSON());

async function playSong(guildId) {
  const q = queues.get(guildId);
  if (!q || !q.songs.length) { q?.connection?.destroy(); queues.delete(guildId); return; }
  const song = q.songs[0];
  const stream = ytdl(song.url, { filter: "audioonly", quality: "highestaudio" });
  const resource = createAudioResource(stream);
  q.player.play(resource);
  q.textChannel.send({ embeds: [
    new EmbedBuilder().setColor(0xec4899).setTitle("🎵 يُشغَّل الآن").setDescription(\`**[\${song.title}](\${song.url})**\`).setTimestamp()
  ]});
}

client.once("ready", async () => {
  console.log(\`🎵 Music Bot ready: \${client.user.tag}\`);
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  const { commandName, guild, member } = i;
  const voiceChannel = member?.voice?.channel;

  if (commandName === "play") {
    if (!voiceChannel) return i.reply({ content: "❌ انضم لقناة صوتية أولاً!", ephemeral: true });
    const url = i.options.getString("url");
    if (!ytdl.validateURL(url)) return i.reply({ content: "❌ رابط YouTube غير صالح.", ephemeral: true });
    await i.deferReply();
    const info = await ytdl.getInfo(url);
    const song = { title: info.videoDetails.title, url };

    if (!queues.has(guild.id)) {
      const player = createAudioPlayer();
      const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
      connection.subscribe(player);
      player.on(AudioPlayerStatus.Idle, () => {
        const q = queues.get(guild.id); if (!q) return;
        q.songs.shift(); playSong(guild.id);
      });
      queues.set(guild.id, { connection, player, songs: [song], textChannel: i.channel });
      await playSong(guild.id);
    } else {
      queues.get(guild.id).songs.push(song);
      await i.editReply({ embeds: [new EmbedBuilder().setColor(0xec4899).setDescription(\`✅ أُضيف للقائمة: **\${song.title}**\`)] });
      return;
    }
    await i.editReply({ content: "✅ جاري التشغيل!" });
  }
  else if (commandName === "skip") {
    queues.get(guild.id)?.player?.stop();
    await i.reply({ content: "⏭️ تم التخطي." });
  }
  else if (commandName === "stop") {
    const q = queues.get(guild.id);
    if (q) { q.songs = []; q.player.stop(); q.connection.destroy(); queues.delete(guild.id); }
    await i.reply({ content: "⏹️ توقف التشغيل." });
  }
  else if (commandName === "queue") {
    const q = queues.get(guild.id);
    const list = q?.songs.map((s, n) => \`\${n+1}. \${s.title}\`).join("\\n") ?? "القائمة فارغة";
    await i.reply({ embeds: [new EmbedBuilder().setColor(0xec4899).setTitle("🎶 قائمة الانتظار").setDescription(list)] });
  }
  else if (commandName === "pause") { queues.get(guild.id)?.player?.pause(); await i.reply({ content: "⏸️ توقف مؤقت." }); }
  else if (commandName === "resume") { queues.get(guild.id)?.player?.unpause(); await i.reply({ content: "▶️ استأنف التشغيل." }); }
});

client.login(process.env.BOT_TOKEN);
`,
  },
  {
    id: "polls-py",
    name: "بوت الاستطلاعات",
    lang: "PY",
    emoji: "📊",
    description: "أوامر /poll ذكية بردود الفعل، مؤقت، نتائج تلقائية عند الانتهاء.",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    tags: ["Polls", "Timer", "Reactions"],
    code: `# Smart Polls Bot — discord.py
import discord
from discord.ext import commands, tasks
from discord import app_commands
import os, asyncio
from datetime import datetime, timedelta

intents = discord.Intents.default()
intents.message_content = True
intents.reactions = True

bot = commands.Bot(command_prefix="!", intents=intents)

# {message_id: {question, options, emojis, end_time, channel_id}}
active_polls = {}
EMOJIS = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"]

@bot.event
async def on_ready():
    await bot.tree.sync()
    check_polls.start()
    print(f"📊 Polls Bot ready: {bot.user}")

@bot.tree.command(name="poll", description="إنشاء استطلاع رأي")
@app_commands.describe(
    question="سؤال الاستطلاع",
    options="الخيارات مفصولة بفاصلة (مثال: نعم,لا,ربما)",
    duration="المدة بالدقائق (افتراضي: 10)"
)
async def poll(interaction: discord.Interaction, question: str,
               options: str = "نعم,لا", duration: int = 10):
    opts = [o.strip() for o in options.split(",")][:10]
    emojis = EMOJIS[:len(opts)]

    embed = discord.Embed(
        title=f"📊 {question}",
        description="\n".join(f"{e} {o}" for e, o in zip(emojis, opts)),
        color=0x06b6d4,
        timestamp=datetime.utcnow()
    )
    embed.set_footer(text=f"ينتهي بعد {duration} دقيقة")

    await interaction.response.send_message(embed=embed)
    msg = await interaction.original_response()

    for emoji in emojis:
        await msg.add_reaction(emoji)

    active_polls[msg.id] = {
        "question": question, "options": opts, "emojis": emojis,
        "end_time": datetime.utcnow() + timedelta(minutes=duration),
        "channel_id": interaction.channel_id
    }

async def end_poll(msg_id: int):
    poll_data = active_polls.pop(msg_id, None)
    if not poll_data: return
    ch = bot.get_channel(poll_data["channel_id"])
    if not ch: return

    try:
        msg = await ch.fetch_message(msg_id)
    except Exception:
        return

    results = []
    for emoji, option in zip(poll_data["emojis"], poll_data["options"]):
        reaction = discord.utils.get(msg.reactions, emoji=emoji)
        count = (reaction.count - 1) if reaction else 0  # -1 لإزالة صوت البوت
        results.append((option, count, emoji))

    total = sum(r[1] for r in results)
    winner = max(results, key=lambda x: x[1]) if results else None

    embed = discord.Embed(
        title=f"📊 نتائج: {poll_data['question']}",
        color=0x10b981,
        timestamp=datetime.utcnow()
    )
    for opt, count, emoji in sorted(results, key=lambda x: -x[1]):
        pct = round((count / total * 100) if total else 0)
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        embed.add_field(name=f"{emoji} {opt}", value=f"{bar} {pct}% ({count} صوت)", inline=False)

    if winner:
        embed.set_footer(text=f"🏆 الفائز: {winner[0]} بـ {winner[1]} صوت")

    await ch.send(embed=embed)

@tasks.loop(seconds=30)
async def check_polls():
    now = datetime.utcnow()
    expired = [mid for mid, p in active_polls.items() if p["end_time"] <= now]
    for mid in expired:
        await end_poll(mid)

bot.run(os.environ["BOT_TOKEN"])
`,
  },
  {
    id: "logger-advanced",
    name: "سجلات متقدمة",
    lang: "PY",
    emoji: "📝",
    description: "تسجيل كامل: رسائل، أعضاء، قنوات، أدوار — Embeds احترافية.",
    color: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    tags: ["Audit", "Events", "Embeds"],
    code: `# Advanced Logger Bot — discord.py
import discord
from discord.ext import commands
from discord import app_commands
import os
from datetime import datetime

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

LOG_CHANNEL = int(os.environ.get("LOG_CHANNEL_ID", "0"))

def get_log_channel(guild: discord.Guild):
    return guild.get_channel(LOG_CHANNEL) or guild.system_channel

def log_embed(color, title, fields: list, thumbnail=None):
    e = discord.Embed(title=title, color=color, timestamp=datetime.utcnow())
    for name, value, inline in fields:
        e.add_field(name=name, value=value or "—", inline=inline)
    if thumbnail:
        e.set_thumbnail(url=thumbnail)
    return e

@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f"📝 Logger Bot ready: {bot.user}")

@bot.event
async def on_member_join(member: discord.Member):
    ch = get_log_channel(member.guild)
    if not ch: return
    e = log_embed(0x10b981, "➕ عضو انضم", [
        ("العضو", f"{member.mention} ({member})", False),
        ("ID", str(member.id), True),
        ("الحساب أُنشئ", f"<t:{int(member.created_at.timestamp())}:R>", True),
        ("إجمالي الأعضاء", str(member.guild.member_count), True),
    ], member.display_avatar.url)
    await ch.send(embed=e)

@bot.event
async def on_member_remove(member: discord.Member):
    ch = get_log_channel(member.guild)
    if not ch: return
    roles = ", ".join(r.mention for r in member.roles[1:]) or "لا يوجد"
    e = log_embed(0xef4444, "➖ عضو غادر", [
        ("العضو", str(member), False),
        ("ID", str(member.id), True),
        ("الأدوار", roles, False),
    ], member.display_avatar.url)
    await ch.send(embed=e)

@bot.event
async def on_message_delete(message: discord.Message):
    if message.author.bot: return
    ch = get_log_channel(message.guild)
    if not ch: return
    e = log_embed(0xf59e0b, "🗑️ رسالة محذوفة", [
        ("الكاتب", message.author.mention, True),
        ("القناة", message.channel.mention, True),
        ("المحتوى", message.content[:1000] if message.content else "—", False),
    ])
    await ch.send(embed=e)

@bot.event
async def on_message_edit(before: discord.Message, after: discord.Message):
    if before.author.bot or before.content == after.content: return
    ch = get_log_channel(before.guild)
    if not ch: return
    e = log_embed(0x3b82f6, "✏️ رسالة معدّلة", [
        ("الكاتب", before.author.mention, True),
        ("القناة", before.channel.mention, True),
        ("قبل", before.content[:500], False),
        ("بعد", after.content[:500], False),
    ])
    e.url = after.jump_url
    await ch.send(embed=e)

@bot.event
async def on_member_update(before: discord.Member, after: discord.Member):
    ch = get_log_channel(before.guild)
    if not ch: return
    if before.nick != after.nick:
        await ch.send(embed=log_embed(0x8b5cf6, "📝 تغيير اللقب", [
            ("العضو", after.mention, True),
            ("قبل", before.nick or "—", True),
            ("بعد", after.nick or "—", True),
        ]))
    added = set(after.roles) - set(before.roles)
    removed = set(before.roles) - set(after.roles)
    if added or removed:
        await ch.send(embed=log_embed(0x6366f1, "🎭 تغيير الأدوار", [
            ("العضو", after.mention, False),
            ("أُضيف", ", ".join(r.mention for r in added) or "—", True),
            ("أُزيل", ", ".join(r.mention for r in removed) or "—", True),
        ]))

@bot.event
async def on_voice_state_update(member, before, after):
    ch = get_log_channel(member.guild)
    if not ch: return
    if before.channel != after.channel:
        if not before.channel:
            desc = f"انضم لـ {after.channel.mention}"
            color = 0x10b981
        elif not after.channel:
            desc = f"غادر {before.channel.mention}"
            color = 0xef4444
        else:
            desc = f"انتقل من {before.channel.mention} إلى {after.channel.mention}"
            color = 0xf59e0b
        await ch.send(embed=log_embed(color, "🔊 نشاط صوتي", [
            ("العضو", member.mention, True), ("التغيير", desc, False)
        ]))

bot.run(os.environ["BOT_TOKEN"])
`,
  },
];

/* ─── تبويب القوالب ──────────────────────────────────────────────────── */

function TemplatesTab({ onSuccess }: { onSuccess: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const [, navigate] = useLocation();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const template = BOT_TEMPLATES.find(t => t.id === selected);

  const deploy = async (openAgent = false) => {
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
      const resp = await fetch(`${BASE}/api/bots/upload`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || "فشل الرفع");
      }

      const result = await resp.json();
      const botId = result?.bot?.id ?? result?.id ?? "";

      toast({ title: "✓ تم إنشاء البوت", description: `"${customName}" جاهز.` });
      invalidateBots(queryClient);
      setDeployed(true);

      if (openAgent && botId) {
        onSuccess();
        const prompt = encodeURIComponent(`لدي قالب "${template.name}" ${template.emoji} جاهز باسم "${customName}". ساعدني في تطويره وتخصيصه أكثر — اقترح تحسينات وميزات إضافية مناسبة لهذا النوع من البوتات.`);
        navigate(`${BASE}/agent?botId=${botId}&botName=${encodeURIComponent(customName)}&prompt=${prompt}`);
      } else if (!openAgent) {
        onSuccess();
      }
    } catch (e: unknown) {
      toast({ title: "فشل النشر", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="pt-2 space-y-4">
      <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pl-0.5">
        {BOT_TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => { setSelected(t.id); setCustomName(t.name); setDeployed(false); }}
            className={cn(
              "text-right p-3 rounded-xl border transition-all text-sm",
              selected === t.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-card hover:border-border/60 hover:bg-muted/30"
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base leading-none">{t.emoji}</span>
              <span className="font-semibold text-xs text-foreground">{t.name}</span>
              <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-3.5 mr-auto", t.color)}>
                {t.lang}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">{t.description}</p>
            <div className="flex flex-wrap gap-1">
              {t.tags.map(tag => (
                <span key={tag} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
              ))}
            </div>
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
              placeholder="مثال: بوت سيرفري"
              className="h-9"
            />
          </div>

          {deployed ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              تم الإنشاء بنجاح!
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => deploy(false)}
                disabled={deploying || !customName.trim()}
              >
                {deploying && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                نشر فقط
              </Button>
              <Button
                onClick={() => deploy(true)}
                disabled={deploying || !customName.trim()}
                className="gap-1.5 bg-primary hover:bg-primary/90"
              >
                {deploying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                نشر + خصّص مع Agent-4
              </Button>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-center">
            "نشر + خصّص" يفتح Agent-4 مع البوت جاهزاً للتطوير
          </p>
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
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>اسم البوت</FormLabel>
            <FormControl><Input placeholder="مثال: بوت الإشراف، بوت الموسيقى" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="space-y-1.5">
          <label className="text-sm font-medium leading-none">ملف الكود المصدري</label>
          <div className="mt-2 flex justify-center rounded-lg border border-dashed border-border px-6 py-8 hover:bg-muted/50 transition-colors">
            <div className="text-center">
              <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-4 flex text-sm leading-6 text-muted-foreground justify-center">
                <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-semibold text-primary hover:text-primary/80">
                  <span>ارفع ملفاً</span>
                  <input id="file-upload" type="file" className="sr-only" accept=".js,.mjs,.cjs,.py"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
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
          <FormItem><FormLabel>رمز GitHub (للخاص)</FormLabel><FormControl><Input type="password" placeholder="ghp_xxxxxxxxxxxx" {...field} /></FormControl><FormMessage /></FormItem>
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
            اختر طريقة نشر البوت: قالب جاهز، رفع ملف، GitHub، أو رابط مباشر.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="templates" className="mt-2">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="templates" className="gap-1 text-xs">
              <Sparkles className="w-3 h-3" />قوالب
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1 text-xs">
              <UploadCloud className="w-3 h-3" />رفع
            </TabsTrigger>
            <TabsTrigger value="github" className="gap-1 text-xs">
              <Github className="w-3 h-3" />GitHub
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-1 text-xs">
              <Link2 className="w-3 h-3" />رابط
            </TabsTrigger>
          </TabsList>
          <TabsContent value="templates">
            <TemplatesTab onSuccess={() => setOpen(false)} />
          </TabsContent>
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
